import { ArrayDecoder, Decoder, PatchableArray, PatchableArrayAutoEncoder } from '@simonbackx/simple-encoding';
import { SimpleError } from '@simonbackx/simple-errors';
import { Toast } from '@stamhoofd/components';
import { Address, EmergencyContact, MemberDetails, MemberWithRegistrations, MemberWithRegistrationsBlob, Parent, Registration, User } from '@stamhoofd/structures';

import { GroupSizeUpdater } from './GroupSizeUpdater';
import { MemberManager } from './MemberManager';

// Manage a complete family so you can sync changes across multiple members (addresses, parents, emergency contacts)
export class FamilyManager {
    /// Currently saved members
    members: MemberWithRegistrations[]
    $memberManager: MemberManager

    constructor($memberManager: MemberManager, members: MemberWithRegistrations[]) {
        this.$memberManager = $memberManager
        this.members = members

        if (members.length == 1) {
            this.loadFamily(members[0].id).catch(e => {
                console.error(e)
                Toast.fromError(e).show()
            })
        }
    }

    get $context() {
        return this.$memberManager.$context
    }

    async loadFamily(id: string) {
        // Send the request
        const response = await this.$context.authenticatedServer.request({
            method: "GET",
            path: "/organization/members/"+id+"/family",
            decoder: new ArrayDecoder(MemberWithRegistrationsBlob as Decoder<MemberWithRegistrationsBlob>),
            shouldRetry: false
        })
        this.setMembers(this.$memberManager.decryptMembersWithRegistrations(response.data))

        for (const member of this.members) {
            this.$memberManager.callListeners("updated", member)
        }
    }

    async addMember(memberDetails: MemberDetails, registrations: Registration[]): Promise<MemberWithRegistrations | null> {
        const session = this.$context

        // Add all the needed users that need to have access
        const users: User[] = []

        for (const email of memberDetails.getManagerEmails()) {
            users.push(User.create({
                email
            }))
        }

        if (!session.organization?.meta.didAcceptEndToEndEncryptionRemoval) {
            throw new SimpleError({
                code: "not_accepted_terms",
                message: 'Het toevoegen van leden is geblokkeerd tot de nieuwe verwerkersovereenkomst en privacyvoorwaarden worden geaccepteerd door een hoofdbeheerder.'
            })
        }

        // Create member
        const encryptedMember = MemberWithRegistrationsBlob.create({
            details: memberDetails,
            registrations,
            users
        })

        // Prepare patch
        const patch: PatchableArrayAutoEncoder<MemberWithRegistrationsBlob> = new PatchableArray()
        patch.addPut(encryptedMember)

        // Patch other members
        const members = (this.members ?? [])
        patch.merge(this.$memberManager.getEncryptedMembersPatch(members))
        
        // Send the request
        const response = await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patch,
            decoder: new ArrayDecoder(MemberWithRegistrationsBlob as Decoder<MemberWithRegistrationsBlob>),
            shouldRetry: false
        })

        this.setMembers(this.$memberManager.decryptMembersWithRegistrations(response.data))
        const m = this.members?.find(m => m.id == encryptedMember.id) ?? null

        // Update group counts only when succesfully adjusted
        if (m) {
            const sizeUpdater = new GroupSizeUpdater();

            for (const registration of m.registrations) {
                sizeUpdater.add(registration, 1);
            }

            sizeUpdater.save(session)
        }

        this.$memberManager.callListeners("created", m)
        return m;
    }

    async patchMemberRegistrations(member: MemberWithRegistrations, registrations: PatchableArrayAutoEncoder<Registration>) {        
        const patchArray = new PatchableArray()
        patchArray.addPatch(MemberWithRegistrations.patch({
            id: member.id,
            registrations
        }))
 
        const session = this.$context

        const oldRegistrations = member.registrations.slice()

        // Send the request
        const response = await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patchArray,
            decoder: new ArrayDecoder(MemberWithRegistrationsBlob as Decoder<MemberWithRegistrationsBlob>),
            shouldRetry: false
        })
        const m = (this.$memberManager.decryptMembersWithRegistrations(response.data))[0]

        const i = this.members.findIndex(_m => _m.id === m.id)
        if (i != -1) {
            this.members[i].set(m)
        }

        member.set(m)

        // Update group counts only when succesfully adjusted
        if (m) {
            const sizeUpdater = new GroupSizeUpdater();

            for (const registration of oldRegistrations) {
                sizeUpdater.add(registration, -1);
            }

            for (const registration of m.registrations) {
                sizeUpdater.add(registration, 1);
            }

            sizeUpdater.save(session)
        }

        this.$memberManager.callListeners("changedGroup", member)
        return member
    }

    async patchAllMembersWith(member: MemberWithRegistrations) {
        const members = (this.members ?? []).filter(m => !!m.details)
        const ex = members.findIndex(m => m.id == member.id)

        if (ex !== -1) {
            members.splice(ex, 1, member)
        } else {
            members.push(member)
        }

        // Search for duplicate addresses and duplicate parents
        this.removeDuplicates()

        const patchArray = this.$memberManager.getEncryptedMembersPatch(members)
        const session = this.$context

        // Send the request
        const response = await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patchArray,
            decoder: new ArrayDecoder(MemberWithRegistrationsBlob as Decoder<MemberWithRegistrationsBlob>),
            shouldRetry: false
        })

        this.setMembers(this.$memberManager.decryptMembersWithRegistrations(response.data))
    }

    setMembers(newMembers: MemberWithRegistrations[]) {
        const s: MemberWithRegistrations[] = []

        for (const member of newMembers) {
            const m = this.members.find(_m => _m.id == member.id)

            if (m) {
                m.set(member)
                s.push(m)
            } else {
                s.push(member)
            }
        }

        this.members = s

        // Search for duplicate addresses and duplicate parents
        this.removeDuplicates()
    }

    updateAddress(oldValue: Address, newValue: Address) {
        if (!this.members) {
            return
        }

        for (const member of this.members) {
            if (!member.details) {
                continue
            }

            member.details.updateAddress(oldValue, newValue)
        }
    }

    /// Update all references to this parent (with same id)
    updateParent(parent: Parent) {
        if (!this.members) {
            return
        }

        for (const member of this.members) {
            if (!member.details) {
                continue
            }

            member.details.updateParent(parent)
        }
    }

    /**
     * Check for duplicate parents
     */
    removeDuplicates() {
        for (const member of this.members) {
            if (!member.details) {
                continue
            }

            member.details.cleanData()
        }
    }
    
    /**
     * List all unique addresses of the already existing members
     */
    getAddresses(): Address[] {
        if (!this.members) {
            return []
        }
        const addresses = new Map<string, Address>()
        for (const member of this.members) {
            if (!member.details) {
                continue
            }

            if (member.details.address) {
                addresses.set(member.details.address.toString(), member.details.address)
            }

            for (const parent of member.details.parents) {
                if (parent.address) {
                    addresses.set(parent.address.toString(), parent.address)
                }
            }
        }

        return Array.from(addresses.values())
    }

    /**
     * List all unique parents of the already existing members
     */
    getParents(): Parent[] {
        if (!this.members) {
            return []
        }
        const parents = new Map<string, Parent>()
        for (const member of this.members) {
            if (!member.details) {
                continue
            }
            for (const parent of member.details.parents) {
                parents.set(parent.id, parent)
            }
        }

        return Array.from(parents.values())
    }

    /**
     * Get last updated emergency contact
     */
    getEmergencyContact(): EmergencyContact | null {
        if (!this.members) {
            return null
        }
        let minDate = -1
        let found: EmergencyContact | null = null

        for (const member of this.members) {
            if (!member.details) {
                continue
            }
            if (member.details.emergencyContacts.length > 0) {
                const lastReviewed = member.details.reviewTimes.getLastReview("emergencyContacts")
                if ((lastReviewed && lastReviewed.getTime() > minDate) || minDate == -1) {
                    minDate = lastReviewed?.getTime() ?? -1
                    found = member.details.emergencyContacts[0]
                }
            }
        }

        return found
    }

}

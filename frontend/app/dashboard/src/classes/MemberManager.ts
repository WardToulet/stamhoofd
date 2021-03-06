

import { ArrayDecoder, AutoEncoderPatchType,ConvertArrayToPatchableArray, Decoder, ObjectData, PatchableArray, PatchableArrayAutoEncoder, PatchType, VersionBox, VersionBoxDecoder } from '@simonbackx/simple-encoding'
import { Sodium } from '@stamhoofd/crypto'
import { Keychain, SessionManager } from '@stamhoofd/networking'
import { EncryptedMember, EncryptedMemberWithRegistrations, EncryptedMemberWithRegistrationsPatch, Group, KeychainedResponseDecoder,KeychainItem, Member, MemberDetails, MemberWithRegistrations, Registration, RegistrationWithEncryptedMember, RegistrationWithMember, User, Version } from '@stamhoofd/structures'

import { OrganizationManager } from './OrganizationManager';

export type MemberChangeEvent = "changedGroup" | "deleted" | "created" | "payment" | "encryption"
export type MembersChangedListener = (type: MemberChangeEvent, member: MemberWithRegistrations | null) => void


/**
 * Controls the fetching and decrypting of members
 */
export class MemberManagerStatic {
    protected listeners: Map<any, MembersChangedListener> = new Map()

    addListener(owner: any, listener: MembersChangedListener) {
        this.listeners.set(owner, listener)
    }

    removeListener(owner: any) {
        this.listeners.delete(owner)
    }

    callListeners(type: MemberChangeEvent, member: MemberWithRegistrations | null) {
        for (const listener of this.listeners.values()) {
            listener(type, member)
        }
    }


    async decryptMembersWithoutRegistrations(data: EncryptedMember[]) {
        // Save keychain items
        const members: Member[] = []
        const session = SessionManager.currentSession!
        const keychainItems: Map<string, {
            publicKey: string;
            privateKey: string;
        } | undefined> = new Map()

        for (const member of data) {
            if (!keychainItems.get(member.organizationPublicKey)) {
                const keychainItem = Keychain.getItem(member.organizationPublicKey)

                let keyPair: {
                    publicKey: string;
                    privateKey: string;
                } | undefined = undefined

                if (keychainItem) {
                    try {
                        keyPair = await session.decryptKeychainItem(keychainItem)
                    } catch (e) {
                        console.error(e)
                        console.error("Invalid keychain item (probably because user encryption key has changed)")
                    }
                } else {
                    console.error("Missing organization keychain item")
                }
                keychainItems.set(member.organizationPublicKey, keyPair)
            }
            const keyPair = keychainItems.get(member.organizationPublicKey)

            let decryptedDetails: MemberDetails | undefined

            if (!member.encryptedForOrganization) {
                console.warn("encryptedForOrganization not set for member " + member.id)
            } else if (!keyPair) {
                // no key
            } else {
                try {
                    const json = await Sodium.unsealMessage(member.encryptedForOrganization, keyPair.publicKey, keyPair.privateKey)
                    const data = new ObjectData(JSON.parse(json), { version: Version }); // version doesn't matter here
                    decryptedDetails = data.decode(new VersionBoxDecoder(MemberDetails as Decoder<MemberDetails>)).data
                } catch (e) {
                    console.error(e)
                    console.error("Failed to read member data for " + member.id)
                }
            }

            if (!decryptedDetails) {
                decryptedDetails =  new MemberDetails()
                decryptedDetails.firstName = member.firstName
                decryptedDetails.setPlaceholder()
            }

            const decryptedMember = Member.create({
                id: member.id,
                firstName: member.firstName,
                details: decryptedDetails ?? null,
                publicKey: member.publicKey,
                organizationPublicKey: member.organizationPublicKey
            })

            members.push(decryptedMember)
        }

        return members;
    }

    async decryptMembers(data: EncryptedMemberWithRegistrations[]) {
        // Save keychain items
        const members: MemberWithRegistrations[] = []
        const groups = OrganizationManager.organization.groups
        const session = SessionManager.currentSession!
        const keychainItems: Map<string, {
            publicKey: string;
            privateKey: string;
        } | undefined> = new Map()

        for (const member of data) {
            if (!keychainItems.get(member.organizationPublicKey)) {
                const keychainItem = Keychain.getItem(member.organizationPublicKey)

                let keyPair: {
                    publicKey: string;
                    privateKey: string;
                } | undefined = undefined

                if (keychainItem) {
                    try {
                        keyPair = await session.decryptKeychainItem(keychainItem)
                    } catch (e) {
                        console.error(e)
                        console.error("Invalid keychain item (probably because user encryption key has changed)")
                    }
                } else {
                    console.error("Missing organization keychain item")
                }
                keychainItems.set(member.organizationPublicKey, keyPair)
            }
            const keyPair = keychainItems.get(member.organizationPublicKey)

            let decryptedDetails: MemberDetails | undefined

            if (!member.encryptedForOrganization) {
                console.warn("encryptedForOrganization not set for member " + member.id)
            } else if (!keyPair) {
                // no key
            } else {
                try {
                    const json = await Sodium.unsealMessage(member.encryptedForOrganization, keyPair.publicKey, keyPair.privateKey)
                    const data = new ObjectData(JSON.parse(json), { version: Version }); // version doesn't matter here
                    decryptedDetails = data.decode(new VersionBoxDecoder(MemberDetails as Decoder<MemberDetails>)).data
                } catch (e) {
                    console.error(e)
                    console.error("Failed to read member data for " + member.id)
                }
            }

            if (!decryptedDetails) {
                decryptedDetails =  new MemberDetails()
                decryptedDetails.firstName = member.firstName
                decryptedDetails.setPlaceholder()
            }

            const decryptedMember = MemberWithRegistrations.create({
                id: member.id,
                details: decryptedDetails,
                publicKey: member.publicKey,
                registrations: member.registrations,
                firstName: member.firstName,
                users: member.users,
                organizationPublicKey: member.organizationPublicKey
            })

            decryptedMember.fillGroups(groups)
            members.push(decryptedMember)
        }

        return members;
    }

    async loadMembers(groupId: string | null = null, waitingList: boolean | null = false, cycleOffset: number | null = 0): Promise<MemberWithRegistrations[]> {
        if (waitingList === null) {
            // Load both waiting list and without waiting list
            const members: MemberWithRegistrations[] = []
            members.push(...(await this.loadMembers(groupId, true, cycleOffset)))
            members.push(...(await this.loadMembers(groupId, false, cycleOffset)))
            return Object.values(members.reduce((acc,cur)=>Object.assign(acc,{[cur.id]:cur}),{}))
        }

        if (cycleOffset === null) {
            // Load both waiting list and without waiting list
            const members: MemberWithRegistrations[] = []
            members.push(...(await this.loadMembers(groupId, waitingList, 1)))
            members.push(...(await this.loadMembers(groupId, waitingList, 0)))

            return Object.values(members.reduce((acc,cur)=>Object.assign(acc,{[cur.id]:cur}),{}))
        }

        const session = SessionManager.currentSession!

        if (groupId === null) {
            const members: MemberWithRegistrations[] = []
            for (const group of session.organization!.groups) {
                if (session.user!.permissions!.hasReadAccess(group.id)) {
                    members.push(...(await this.loadMembers(group.id, waitingList, cycleOffset)))
                }
            }
            // remove duplicates
            return Object.values(members.reduce((acc,cur)=>Object.assign(acc,{[cur.id]:cur}),{}))
        }
        const response = await session.authenticatedServer.request({
            method: "GET",
            path: "/organization/group/" + groupId + "/members",
            decoder: new KeychainedResponseDecoder(new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>)),
            query: { waitingList, cycleOffset }
        })

        Keychain.addItems(response.data.keychainItems)
        return await this.decryptMembers(response.data.data)
    }

    getRegistrationsPatchArray(): ConvertArrayToPatchableArray<Registration[]> {
        return new PatchableArray()
    }

    getPatchArray(): ConvertArrayToPatchableArray<EncryptedMemberWithRegistrations[]> {
        return new PatchableArray()
    }

    async getEncryptedMembers(members: MemberWithRegistrations[]): Promise<EncryptedMemberWithRegistrations[]> {
        const encryptedMembers: EncryptedMemberWithRegistrations[] = [];

        for (const member of members) {
            if (!member.details) {
                throw new Error("Can't save member with undefined details!")
            }
            const data = JSON.stringify(new VersionBox(member.details).encode({ version: Version }))

            encryptedMembers.push(
                EncryptedMemberWithRegistrations.create({
                    id: member.id,
                    encryptedForOrganization: await Sodium.sealMessage(data, OrganizationManager.organization.publicKey),
                    encryptedForMember: await Sodium.sealMessage(data, member.publicKey),
                    publicKey: member.publicKey,
                    organizationPublicKey: OrganizationManager.organization.publicKey,
                    firstName: member.details.firstName,
                    placeholder: member.placeholder,
                    registrations: member.registrations,
                    users: member.users
                })
            )
        }
        return encryptedMembers
    }

    async getEncryptedMembersPatch(members: MemberWithRegistrations[]): Promise<AutoEncoderPatchType<EncryptedMemberWithRegistrations>[]> {
        const encryptedMembers: AutoEncoderPatchType<EncryptedMemberWithRegistrations>[] = [];

        for (const member of members) {
            if (!member.details) {
                throw new Error("Can't save member with undefined details!")
            }
            const data = JSON.stringify(new VersionBox(member.details).encode({ version: Version }))

            // Check if this user has missing users
            const missing: PatchableArrayAutoEncoder<User> = new PatchableArray()
            const managers = member.details.getManagerEmails()
            for(const email of managers) {
                const user = member.users.find(u => u.email === email)
                if (!user) {
                    console.log("link email "+email)
                    missing.addPut(User.create({
                        email
                    }))
                } else {
                    console.log("already linked "+email)
                }
            }

            // Delete users that never created an account
            for (const user of member.users) {
                if (user.publicKey) {
                    continue
                }

                const exists = managers.find(m => m === user.email)
                if (!exists) {
                    // This email has been removed from the managers
                    missing.addDelete(user.id)
                }
            }

            encryptedMembers.push(
                EncryptedMemberWithRegistrations.patch({
                    id: member.id,
                    encryptedForOrganization: await Sodium.sealMessage(data, OrganizationManager.organization.publicKey),
                    encryptedForMember: await Sodium.sealMessage(data, member.publicKey),
                    publicKey: member.publicKey,
                    organizationPublicKey: OrganizationManager.organization.publicKey,
                    firstName: member.details.firstName,
                    placeholder: false,
                    users: missing
                })
            )
        }
        return encryptedMembers
    }

    async patchMemberDetails(member: MemberWithRegistrations): Promise<MemberWithRegistrations | null> {
        const encrypted = await this.getEncryptedMembers([member])

        const patchArray = new PatchableArray()
        for (const m of encrypted) {
            patchArray.addPatch(EncryptedMemberWithRegistrationsPatch.create({
                id: m.id,
                encryptedForOrganization: m.encryptedForOrganization,
                encryptedForMember: m.encryptedForMember,
                organizationPublicKey: m.organizationPublicKey,
                publicKey: m.publicKey,
            }))

            // todo: add missing users as placeholder users
            // todo: why is first name not updated here?
        }

        const session = SessionManager.currentSession!
        const response = await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patchArray,
            decoder: new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>)
        })
        return (await this.decryptMembers(response.data))[0] ?? null
    }

    async patchMembers(members: ConvertArrayToPatchableArray<EncryptedMemberWithRegistrations[]>) {
        const session = SessionManager.currentSession!
        const response = await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            decoder: new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>),
            body: members
        })
        return await this.decryptMembers(response.data)
    }

    async deleteMembers(members: MemberWithRegistrations[]) {
        const patchArray = new PatchableArray()
        for (const member of members) (
            patchArray.addDelete(member.id)
        )
 
        const session = SessionManager.currentSession!

        // Send the request
        await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patchArray,
            decoder: new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>)
        })

        this.callListeners("deleted", null)
    }

    async deleteMember(member: MemberWithRegistrations) {
        const patchArray = new PatchableArray()
        patchArray.addDelete(member.id)
 
        const session = SessionManager.currentSession!

        // Send the request
        await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patchArray,
            decoder: new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>)
        })

        this.callListeners("deleted", member)
    }

    async unregisterMembers(members: MemberWithRegistrations[], group: Group | null = null, cycleOffset = 0, waitingList = false) {
        const patchArray = new PatchableArray()

        for (const member of members) {
            const patchMember = EncryptedMemberWithRegistrations.patch({ id: member.id })

            if (group === null) {
                for (const registration of member.activeRegistrations) {
                    if (registration.waitingList === waitingList) {
                        patchMember.registrations.addDelete(registration.id)
                    }
                }
            } else {
                for (const registration of member.registrations) {
                    if (registration.groupId === group.id && registration.cycle === group.cycle - cycleOffset && registration.waitingList === waitingList) {
                        patchMember.registrations.addDelete(registration.id)
                    }
                }
            }
            
            patchArray.addPatch(patchMember)
        }
   
 
        const session = SessionManager.currentSession!

        // Send the request
        await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patchArray,
            decoder: new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>)
        })

        this.callListeners("deleted", null)
    }

    async acceptFromWaitingList(members: MemberWithRegistrations[], group: Group | null = null, cycleOffset = 0) {
        const patchArray = new PatchableArray()

        for (const member of members) {
            const patchMember = EncryptedMemberWithRegistrations.patch({ id: member.id })

            if (group === null) {
                for (const registration of member.activeRegistrations) {
                    if (registration.waitingList === true) {
                        patchMember.registrations.addPatch(Registration.patch({
                            id: registration.id,
                            waitingList: false
                        }))
                    }
                }
            } else {
                for (const registration of member.registrations) {
                    if (registration.groupId === group.id && registration.cycle === group.cycle - cycleOffset && registration.waitingList === true) {
                        patchMember.registrations.addPatch(Registration.patch({
                            id: registration.id,
                            waitingList: false
                        }))
                    }
                }
            }
            
            patchArray.addPatch(patchMember)
        }
   
 
        const session = SessionManager.currentSession!

        // Send the request
        await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patchArray,
            decoder: new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>)
        })

        this.callListeners("deleted", null)
    }

    async moveToWaitingList(members: MemberWithRegistrations[], group: Group | null = null, cycleOffset = 0) {
        const patchArray = new PatchableArray()

        for (const member of members) {
            const patchMember = EncryptedMemberWithRegistrations.patch({ id: member.id })

            if (group === null) {
                for (const registration of member.activeRegistrations) {
                    if (registration.waitingList === false) {
                        patchMember.registrations.addPatch(Registration.patch({
                            id: registration.id,
                            waitingList: true
                        }))
                    }
                }
            } else {
                for (const registration of member.registrations) {
                    if (registration.groupId === group.id && registration.cycle === group.cycle - cycleOffset && registration.waitingList === false) {
                        patchMember.registrations.addPatch(Registration.patch({
                            id: registration.id,
                            waitingList: true
                        }))
                    }
                }
            }
            
            patchArray.addPatch(patchMember)
        }
   
 
        const session = SessionManager.currentSession!

        // Send the request
        await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patchArray,
            decoder: new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>)
        })

        this.callListeners("deleted", null)
    }

    async unregisterMember(member: MemberWithRegistrations, group: Group | null = null, cycleOffset = 0, waitingList = false) {
        const patchArray = new PatchableArray()
        const patchMember = EncryptedMemberWithRegistrations.patch({ id: member.id })

        if (group === null) {
            for (const registration of member.activeRegistrations) {
                if (registration.waitingList === waitingList) {
                    patchMember.registrations.addDelete(registration.id)
                }
            }
        } else {
            for (const registration of member.registrations) {
                if (registration.groupId === group.id && registration.cycle === group.cycle - cycleOffset && registration.waitingList === waitingList) {
                    patchMember.registrations.addDelete(registration.id)
                }
            }
        }

        patchArray.addPatch(patchMember)
 
        const session = SessionManager.currentSession!

        // Send the request
        await session.authenticatedServer.request({
            method: "PATCH",
            path: "/organization/members",
            body: patchArray,
            decoder: new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>)
        })

        this.callListeners("deleted", member)
    }
}

export const MemberManager = new MemberManagerStatic()
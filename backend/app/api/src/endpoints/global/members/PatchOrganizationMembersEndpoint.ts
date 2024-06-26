import { OneToManyRelation } from '@simonbackx/simple-database';
import { ConvertArrayToPatchableArray, Decoder, PatchableArrayAutoEncoder, PatchableArrayDecoder, StringDecoder } from '@simonbackx/simple-encoding';
import { DecodedRequest, Endpoint, Request, Response } from "@simonbackx/simple-endpoints";
import { SimpleError } from "@simonbackx/simple-errors";
import { BalanceItem, BalanceItemPayment, Document, Group, Member, MemberFactory, MemberWithRegistrations, Organization, Payment, Registration, User } from '@stamhoofd/models';
import { BalanceItemStatus, MemberWithRegistrationsBlob, MembersBlob, PaymentMethod, PaymentStatus, PermissionLevel, Registration as RegistrationStruct, User as UserStruct } from "@stamhoofd/structures";
import { Formatter } from '@stamhoofd/utility';

import { AuthenticatedStructures } from '../../../helpers/AuthenticatedStructures';
import { Context } from '../../../helpers/Context';

type Params = Record<string, never>;
type Query = undefined;
type Body = PatchableArrayAutoEncoder<MemberWithRegistrationsBlob>
type ResponseBody = MembersBlob

/**
 * One endpoint to create, patch and delete members and their registrations and payments
 */

export class PatchOrganizationMembersEndpoint extends Endpoint<Params, Query, Body, ResponseBody> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    bodyDecoder = new PatchableArrayDecoder(MemberWithRegistrationsBlob as any, MemberWithRegistrationsBlob.patchType(), StringDecoder) as any as Decoder<ConvertArrayToPatchableArray<MemberWithRegistrationsBlob[]>>

    protected doesMatch(request: Request): [true, Params] | [false] {
        if (request.method != "PATCH") {
            return [false];
        }

        const params = Endpoint.parseParameters(request.url, "/organization/members", {});

        if (params) {
            return [true, params as Params];
        }
        return [false];
    }

    async handle(request: DecodedRequest<Params, Query, Body>) {
        const organization = await Context.setOptionalOrganizationScope();
        await Context.authenticate()

        // Fast throw first (more in depth checking for patches later)
        if (organization) {
            if (!await Context.auth.hasSomeAccess(organization.id)) {
                throw Context.auth.error()
            } 
        } else {
            if (!Context.auth.hasSomePlatformAccess()) {
                throw Context.auth.error()
            } 
        }

        const members: MemberWithRegistrations[] = []

        // Cache
        const groups: Group[] = []
        
        async function getGroup(id: string) {
            const f = groups.find(g => g.id === id)
            if (f) {
                return f
            }
            const group = await Group.getByID(id)
            if (group) {
                groups.push(group)
                return group
            }
            return null
        }
        const updateGroups = new Map<string, Group>()

        const balanceItemMemberIds: string[] = []
        const balanceItemRegistrationIdsPerOrganization: Map<string, string[]> = new Map()

        function addBalanceItemRegistrationId(organizationId: string, registrationId: string) {
            const existing = balanceItemRegistrationIdsPerOrganization.get(organizationId);
            if (existing) {
                existing.push(registrationId)
                return;
            }
            balanceItemRegistrationIdsPerOrganization.set(organizationId, [registrationId])
        }

        // Loop all members one by one
        for (const put of request.body.getPuts()) {
            const struct = put.put
            let member = new Member().setManyRelation(Member.registrations as any as OneToManyRelation<"registrations", Member, Registration>, []).setManyRelation(Member.users, [])
            member.id = struct.id

            if (organization && STAMHOOFD.userMode !== 'platform') {
                member.organizationId = organization.id
            }

            struct.details.cleanData()
            member.details = struct.details

            const duplicate = await PatchOrganizationMembersEndpoint.checkDuplicate(member);
            if (duplicate) {
                // Merge data
                duplicate.details.merge(member.details)
                member = duplicate

                // Only save after checking permissions
            }

            if (struct.registrations.length === 0) {
                 throw new SimpleError({
                    code: "missing_group",
                    message: "Missing group",
                    human: "Schrijf een nieuw lid altijd in voor minstens één groep",
                    statusCode: 400
                })
            }

            // Throw early
            for (const registrationStruct of struct.registrations) {
                const group = await getGroup(registrationStruct.groupId)
                if (!group || group.organizationId !== registrationStruct.organizationId || !await Context.auth.canAccessGroup(group, PermissionLevel.Write)) {
                    throw Context.auth.notFoundOrNoAccess("Je hebt niet voldoende rechten om leden toe te voegen in deze groep")
                }

                // Set organization id of member based on registrations
                if (!organization && STAMHOOFD.userMode !== 'platform' && !member.organizationId) {
                    member.organizationId = group.organizationId
                }
            }

            if (STAMHOOFD.userMode !== 'platform' && !member.organizationId) {
                throw new SimpleError({
                    code: "missing_organization",
                    message: "Missing organization",
                    human: "Je moet een organisatie selecteren voor dit lid",
                    statusCode: 400
                })
            }

            /**
             * In development mode, we allow some secret usernames to create fake data
             */
            if ((STAMHOOFD.environment == "development" || STAMHOOFD.environment == "staging") && organization) {
                if (member.details.firstName.toLocaleLowerCase() == "create" && parseInt(member.details.lastName) > 0) {
                    const count = parseInt(member.details.lastName);
                    let group = groups[0];

                    for (const registrationStruct of struct.registrations) {
                        const g = await getGroup(registrationStruct.groupId)
                        if (g) {
                            group = g
                        }
                    }

                    await this.createDummyMembers(organization, group, count)

                    // Skip creating this member
                    continue;
                }
            }

            await member.save()
            members.push(member)
            balanceItemMemberIds.push(member.id)

            // Add registrations
            for (const registrationStruct of struct.registrations) {
                const group = await getGroup(registrationStruct.groupId)
                if (!group || group.organizationId !== registrationStruct.organizationId || !await Context.auth.canAccessGroup(group, PermissionLevel.Write)) {
                    throw Context.auth.notFoundOrNoAccess("Je hebt niet voldoende rechten om leden toe te voegen in deze groep")
                }

                const reg = await this.addRegistration(member, registrationStruct, group)
                addBalanceItemRegistrationId(reg.organizationId, reg.id)

                // Update occupancy at the end of the call
                updateGroups.set(group.id, group)
            }

            // Add users if they don't exist (only placeholders allowed)
            for (const placeholder of struct.users) {
                await PatchOrganizationMembersEndpoint.linkUser(placeholder, member)
            }

            // Auto link users based on data
            await PatchOrganizationMembersEndpoint.updateManagers(member)
        }

        // Loop all members one by one
        for (let patch of request.body.getPatches()) {
            const member = members.find(m => m.id === patch.id) ?? await Member.getWithRegistrations(patch.id)
            if (!member || !await Context.auth.canAccessMember(member, PermissionLevel.Write)) {
                throw Context.auth.notFoundOrNoAccess("Je hebt geen toegang tot dit lid of het bestaat niet")
            }
            patch = await Context.auth.filterMemberPatch(member, patch)

            if (patch.details) {
                if (patch.details.isPut()) {
                    throw new SimpleError({
                        code: "not_allowed",
                        message: "Cannot override details",
                        human: "Er ging iets mis bij het aanpassen van de gegevens van dit lid. Probeer het later opnieuw en neem contact op als het probleem zich blijft voordoen.",
                        field: "details"
                    })
                }
                
                member.details.patchOrPut(patch.details)
                member.details.cleanData()
            }
            
            await member.save();

            // Update documents
            await Document.updateForMember(member.id)

            // Update registrations
            for (const patchRegistration of patch.registrations.getPatches()) {
                const registration = member.registrations.find(r => r.id === patchRegistration.id)
                if (!registration || registration.memberId != member.id) {
                    throw new SimpleError({
                        code: "permission_denied",
                        message: "You don't have permissions to access this endpoint",
                        human: "Je hebt geen toegang om deze registratie te wijzigen"
                    })
                }

                let group: Group | null = null
                

                if (patchRegistration.groupId) {
                    group = await getGroup(patchRegistration.groupId)
                    if (group) {
                        // We need to update group occupancy because we moved a member to it
                        updateGroups.set(group.id, group)
                    }
                    const oldGroup = await getGroup(registration.groupId)
                    if (oldGroup) {
                        // We need to update this group occupancy because we moved one member away from it
                        updateGroups.set(oldGroup.id, oldGroup)
                    }
                } else {
                    group = await getGroup(registration.groupId)
                }

                if (!group || group.organizationId !== (patchRegistration.organizationId ?? registration.organizationId)) {
                    throw new SimpleError({
                        code: "invalid_field",
                        message: "Group doesn't exist",
                        human: "De groep naarwaar je dit lid wilt verplaatsen bestaat niet",
                        field: "groupId"
                    })
                }

                if (!await Context.auth.canAccessGroup(group, PermissionLevel.Write)) {
                    throw Context.auth.error("Je hebt niet voldoende rechten om leden te verplaatsen naar deze groep")
                }

                if (patchRegistration.cycle && patchRegistration.cycle > group.cycle) {
                    throw new SimpleError({
                        code: "invalid_field",
                        message: "Invalid cycle",
                        human: "Je kan een lid niet inschrijven voor een groep die nog moet starten",
                        field: "cycle"
                    })
                }

                // TODO: allow group changes
                registration.waitingList = patchRegistration.waitingList ?? registration.waitingList

                if (!registration.waitingList && registration.registeredAt === null) {
                    registration.registeredAt = new Date()
                }
                registration.canRegister = patchRegistration.canRegister ?? registration.canRegister
                if (!registration.waitingList) {
                    registration.canRegister = false
                }
                registration.cycle = patchRegistration.cycle ?? registration.cycle
                registration.groupId = patchRegistration.groupId ?? registration.groupId
                registration.organizationId = patchRegistration.organizationId ?? registration.organizationId

                // Check if we should create a placeholder payment?

                if (patchRegistration.cycle !== undefined || patchRegistration.waitingList !== undefined || patchRegistration.canRegister !== undefined) {
                    // We need to update occupancy (because cycle / waitlist change)
                    updateGroups.set(group.id, group)
                }

                if (patchRegistration.price) {
                    // Create balance item
                    const balanceItem = new BalanceItem();
                    balanceItem.registrationId = registration.id;
                    balanceItem.price = patchRegistration.price
                    balanceItem.description = group ? `Inschrijving ${group.settings.name}` : `Inschrijving`
                    balanceItem.pricePaid = patchRegistration.pricePaid ?? 0
                    balanceItem.memberId = registration.memberId;
                    balanceItem.userId = member.users[0]?.id ?? null
                    balanceItem.organizationId = group.organizationId
                    balanceItem.status = BalanceItemStatus.Pending;
                    await balanceItem.save();

                    addBalanceItemRegistrationId(registration.organizationId, registration.id)
                    balanceItemMemberIds.push(member.id)

                    if (balanceItem.pricePaid > 0) {
                        // Create an Unknown payment and attach it to the balance item
                        const payment = new Payment();
                        payment.userId = member.users[0]?.id ?? null
                        payment.organizationId = member.organizationId
                        payment.method = PaymentMethod.Unknown
                        payment.status = PaymentStatus.Succeeded
                        payment.price = balanceItem.pricePaid;
                        payment.paidAt = new Date()
                        payment.provider = null
                        await payment.save()

                        const balanceItemPayment = new BalanceItemPayment()
                        balanceItemPayment.balanceItemId = balanceItem.id;
                        balanceItemPayment.paymentId = payment.id;
                        balanceItemPayment.organizationId = group.organizationId
                        balanceItemPayment.price = payment.price;
                        await balanceItemPayment.save();
                    }
                }

                await registration.save()
            }

            for (const deleteId of patch.registrations.getDeletes()) {
                const registration = member.registrations.find(r => r.id === deleteId)
                if (!registration || registration.memberId != member.id) {
                    throw new SimpleError({
                        code: "permission_denied",
                        message: "You don't have permissions to access this endpoint",
                        human: "Je hebt geen toegang om deze registratie te wijzigen"
                    })
                }

                if (!await Context.auth.canAccessRegistration(registration, PermissionLevel.Write)) {
                    throw Context.auth.error("Je hebt niet voldoende rechten om deze inschrijving te verwijderen")
                }

                balanceItemMemberIds.push(member.id)                
                await BalanceItem.deleteForDeletedRegistration(registration.id)
                await registration.delete()
                member.registrations = member.registrations.filter(r => r.id !== deleteId)

                const oldGroup = await getGroup(registration.groupId)
                if (oldGroup) {
                    // We need to update this group occupancy because we moved one member away from it
                    updateGroups.set(oldGroup.id, oldGroup)
                }
            }

            // Add registrations
            for (const registrationStruct of patch.registrations.getPuts()) {
                const struct = registrationStruct.put
                const group = await getGroup(struct.groupId)

                if (!group || group.organizationId !== struct.organizationId || !await Context.auth.canAccessGroup(group, PermissionLevel.Write)) {
                    throw Context.auth.error("Je hebt niet voldoende rechten om inschrijvingen in deze groep te maken")
                }

                const reg = await this.addRegistration(member, struct, group)
                balanceItemMemberIds.push(member.id)
                addBalanceItemRegistrationId(reg.organizationId, reg.id)

                // We need to update this group occupancy because we moved one member away from it
                updateGroups.set(group.id, group)
            }

            // Link users
            for (const placeholder of patch.users.getPuts()) {
                await PatchOrganizationMembersEndpoint.linkUser(placeholder.put, member)
            }

            // Unlink users
            for (const userId of patch.users.getDeletes()) {
                await PatchOrganizationMembersEndpoint.unlinkUser(userId, member)
            }

            // Auto link users based on data
            if (patch.users.changes.length || patch.details) {
                await PatchOrganizationMembersEndpoint.updateManagers(member)
            }

            if (!members.find(m => m.id === member.id)) {
                members.push(member)
            }
        }

        // Loop all members one by one
        for (const id of request.body.getDeletes()) {
            const member = await Member.getWithRegistrations(id)
            if (!member || !await Context.auth.canDeleteMember(member)) {
                throw Context.auth.error("Je hebt niet voldoende rechten om dit lid te verwijderen")
            }

            await User.deleteForDeletedMember(member.id)
            await BalanceItem.deleteForDeletedMember(member.id)
            await member.delete()

            // Update occupancy of this member because we removed registrations
            const groupIds = member.registrations.flatMap(r => r.groupId)
            for (const id of groupIds) {
                const group = await getGroup(id)
                if (group) {
                    // We need to update this group occupancy because we moved one member away from it
                    updateGroups.set(group.id, group)
                }
            }
        }

        await Member.updateOutstandingBalance(Formatter.uniqueArray(balanceItemMemberIds))
        for (const [organizationId, balanceItemRegistrationIds] of balanceItemRegistrationIdsPerOrganization) {
            await Registration.updateOutstandingBalance(Formatter.uniqueArray(balanceItemRegistrationIds), organizationId)
        }
        
        // Loop all groups and update occupancy if needed
        for (const group of updateGroups.values()) {
            await group.updateOccupancy()
            await group.save()
        }
        
        // We need to refetch the outstanding amounts of members that have changed
        const updatedMembers = balanceItemMemberIds.length > 0 ? await Member.getBlobByIds(...balanceItemMemberIds) : []
        for (const member of updatedMembers) {
            const index = members.findIndex(m => m.id === member.id)
            if (index !== -1) {
                members[index] = member
            }
        }

        return new Response(
            await AuthenticatedStructures.membersBlob(members)
        );
    }

    static async checkDuplicate(member: Member) {
        if (!member.details.birthDay) {
            return
        }
        const existingMembers = await Member.where({ organizationId: member.organizationId, firstName: member.details.firstName, lastName: member.details.lastName, birthDay: Formatter.dateIso(member.details.birthDay) });
        
        if (existingMembers.length > 0) {
            const withRegistrations = await Member.getBlobByIds(...existingMembers.map(m => m.id))
            for (const member of withRegistrations) {
                if (member.registrations.length > 0) {
                    return member
                }
            }

            if (withRegistrations.length > 0) {
                return withRegistrations[0]
            }
        }
    }

    async addRegistration(member: Member & Record<"registrations", Registration[]> & Record<"users", User[]>, registrationStruct: RegistrationStruct, group: Group) {
        // Check if this member has this registration already.
        // Note: we cannot use the relation here, because invalid ones or reserved ones are not loaded in there
        const existings = await Registration.where({ 
            memberId: member.id, 
            groupId: registrationStruct.groupId,
            cycle: registrationStruct.cycle
        }, { limit: 1 })
        const existing = existings.length > 0 ? existings[0] : null

        // If the existing is invalid, delete it.
        if (existing && !existing.registeredAt && !existing.waitingList) {
            console.log('Deleting invalid registration', existing.id)
            await existing.delete()
        } else if (existing) {
            throw new SimpleError({
                code: "invalid_field",
                message: "Registration already exists",
                human: existing.waitingList ? "Dit lid staat al op de wachtlijst voor deze groep" : "Dit lid is al ingeschreven voor deze groep",
                field: "groupId"
            });
        }

        if (!group) {
            throw new SimpleError({
                code: 'invalid_field',
                field: 'groupId',
                message: 'Invalid groupId',
                human: 'Deze inschrijvingsgroep is ongeldig'
            })
        }

        const registration = new Registration()
        registration.groupId = registrationStruct.groupId
        registration.organizationId = group.organizationId
        registration.cycle = registrationStruct.cycle
        registration.memberId = member.id
        registration.registeredAt = registrationStruct.registeredAt
        registration.waitingList = registrationStruct.waitingList
        registration.createdAt = registrationStruct.createdAt ?? new Date()

        if (registration.waitingList) {
            registration.registeredAt = null
        }
        registration.canRegister = registrationStruct.canRegister

        if (!registration.waitingList) {
            registration.canRegister = false
        }
        registration.deactivatedAt = registrationStruct.deactivatedAt

        await registration.save()
        member.registrations.push(registration)

        if (registrationStruct.price) {
            // Create balance item
            const balanceItem = new BalanceItem();
            balanceItem.registrationId = registration.id;
            balanceItem.price = registrationStruct.price
            balanceItem.description = group ? `Inschrijving ${group.settings.name}` : `Inschrijving`
            balanceItem.pricePaid = registrationStruct.pricePaid ?? 0
            balanceItem.memberId = registration.memberId;
            balanceItem.userId = member.users[0]?.id ?? null
            balanceItem.organizationId = group.organizationId
            balanceItem.status = BalanceItemStatus.Pending;
            await balanceItem.save();

            if (balanceItem.pricePaid > 0) {
                // Create an Unknown payment and attach it to the balance item
                const payment = new Payment();
                payment.userId = member.users[0]?.id ?? null
                payment.organizationId = member.organizationId
                payment.method = PaymentMethod.Unknown
                payment.status = PaymentStatus.Succeeded
                payment.price = balanceItem.pricePaid;
                payment.paidAt = new Date()
                payment.provider = null
                await payment.save()

                const balanceItemPayment = new BalanceItemPayment()
                balanceItemPayment.balanceItemId = balanceItem.id;
                balanceItemPayment.paymentId = payment.id;
                balanceItemPayment.organizationId = group.organizationId
                balanceItemPayment.price = payment.price;
                await balanceItemPayment.save();
            }
        }

        return registration
    }

    async createDummyMembers(organization: Organization, group: Group, count: number) {
        const members = await new MemberFactory({ 
            organization,
            minAge: group.settings.minAge ?? undefined,
            maxAge: group.settings.maxAge ?? undefined
        }).createMultiple(count)

        for (const m of members) {
            const member = m.setManyRelation(Member.registrations as unknown as OneToManyRelation<"registrations", Member, Registration>, []).setManyRelation(Member.users, [])
            const d = new Date(new Date().getTime() - Math.random() * 60 * 1000 * 60 * 24 * 60)

            // Create a registration for this member for thisg roup
            const registration = new Registration()
            registration.organizationId = organization.id
            registration.memberId = member.id
            registration.groupId = group.id
            registration.cycle = group.cycle
            registration.registeredAt = d

            member.registrations.push(registration)
            await registration.save()
        }
    }

    static async updateManagers(member: MemberWithRegistrations) {
        // Check accounts
        const managers = member.details.getManagerEmails()

        for(const email of managers) {
            const u = member.users.find(u => u.email.toLocaleLowerCase() === email.toLocaleLowerCase())
            if (!u) {
                console.log("Linking user "+email+" to member "+member.id)
                await PatchOrganizationMembersEndpoint.linkUser(UserStruct.create({
                    firstName: member.details.parents.find(p => p.email === email)?.firstName,
                    lastName: member.details.parents.find(p => p.email === email)?.lastName,
                    email,
                }), member)
            }
        }

        // Delete accounts that should no longer have access
        for (const u of member.users) {
            if (!u.hasAccount()) {
                // And not in managers list (case insensitive)
                if (!managers.find(m => m.toLocaleLowerCase() === u.email.toLocaleLowerCase())) {
                    console.log("Unlinking user "+u.email+" from member "+member.id)
                    await PatchOrganizationMembersEndpoint.unlinkUser(u.id, member)
                }
            }
        }
    }

    static async linkUser(user: UserStruct, member: MemberWithRegistrations) {
        const email = user.email
        let u = await User.getForAuthentication(member.organizationId, email, {allowWithoutAccount: true});
        if (u) {
            console.log("Giving an existing user access to a member: "+u.id)
        } else {
            u = new User()
            u.organizationId = member.organizationId
            u.email = email
            u.firstName = user.firstName
            u.lastName = user.lastName
            await u.save()

            console.log("Created new (placeholder) user that has access to a member: "+u.id)
        }

        await Member.users.reverse("members").link(u, [member])

        // Update model relation to correct response
        member.users.push(u)
    }

    static async unlinkUser(userId: string, member: MemberWithRegistrations) {
        console.log("Removing access for "+ userId +" to member "+member.id)
        const existingIndex = member.users.findIndex(u => u.id === userId)
        if (existingIndex === -1) {
            throw new SimpleError({
                code: "user_not_found",
                message: "Unlinking a user that doesn't exists anymore",
                human: "Je probeert de toegang van een account tot een lid te verwijderen, maar dat account bestaat niet (meer)"
            })
        }
        const existing = member.users[existingIndex]
        await Member.users.reverse("members").unlink(existing, member)

        // Update model relation to correct response
        member.users.splice(existingIndex, 1)
    }
}

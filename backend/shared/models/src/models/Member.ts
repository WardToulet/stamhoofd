import { column, Database, ManyToManyRelation, ManyToOneRelation, Model, OneToManyRelation } from '@simonbackx/simple-database';
import { SQL } from "@stamhoofd/sql";
import { Member as MemberStruct, MemberDetails, MemberWithRegistrationsBlob, RegistrationWithMember as RegistrationWithMemberStruct, User as UserStruct } from '@stamhoofd/structures';
import { Formatter } from '@stamhoofd/utility';
import { v4 as uuidv4 } from "uuid";

import { Payment, Registration, User } from './';
export type MemberWithRegistrations = Member & { 
    users: User[], 
    registrations: Registration[] 
}

// Defined here to prevent cycles
export type RegistrationWithMember = Registration & { member: Member }

export class Member extends Model {
    static table = "members"

    // Columns
    @column({
        primary: true, type: "string", beforeSave(value) {
            return value ?? uuidv4();
        }
    })
    id!: string;

    @column({ type: "string", nullable: true })
    organizationId: string|null = null;

    @column({
        type: "string", 
        beforeSave: function() {
            return this.details?.firstName ?? ''
        },
        skipUpdate: true
    })
    firstName: string

    @column({ type: "string", 
        beforeSave: function() {
            return this.details?.lastName ?? ''
        },
        skipUpdate: true })
    lastName: string

    @column({ 
        type: "string", 
        nullable: true, 
        beforeSave: function(this: Member) {
            return this.details?.birthDay ? Formatter.dateIso(this.details.birthDay) : null
        },
        skipUpdate: true 
    })
    birthDay: string | null

    @column({ type: "json", decoder: MemberDetails })
    details: MemberDetails

    /**
     * Not yet paid balance
     */
    @column({ type: "integer" })
    outstandingBalance = 0

    @column({
        type: "datetime", beforeSave(old?: any) {
            if (old !== undefined) {
                return old;
            }
            const date = new Date()
            date.setMilliseconds(0)
            return date
        }
    })
    createdAt: Date

    @column({
        type: "datetime", beforeSave() {
            const date = new Date()
            date.setMilliseconds(0)
            return date
        },
        skipUpdate: true
    })
    updatedAt: Date

    static registrations = new OneToManyRelation(Member, Registration, "registrations", "memberId")

    // Note: all relations should point to their parents, not the other way around to avoid reference cycles
    static users = new ManyToManyRelation(Member, User, "users");

    /**
     * Fetch all members with their corresponding (valid) registration
     */
    static async getWithRegistrations(id: string): Promise<MemberWithRegistrations | null> {
        return (await this.getBlobByIds(id))[0] ?? null
    }

    /**
     * Update the outstanding balance of multiple members in one go (or all members)
     */
    static async updateOutstandingBalance(memberIds: string[] | 'all') {
        if (memberIds !== 'all' && memberIds.length == 0) {
            return
        }

        const params: any[] = []
        let firstWhere = ''
        let secondWhere = ''

        if (memberIds !== 'all') {
            firstWhere = ` AND memberId IN (?)`
            params.push(memberIds)

            secondWhere = `WHERE members.id IN (?)`
            params.push(memberIds)
        }
        
        const query = `UPDATE
            members
            LEFT JOIN (
                SELECT
                    memberId,
                    sum(price) - sum(pricePaid) AS outstandingBalance
                FROM
                    balance_items
                WHERE status != 'Hidden'${firstWhere}
                GROUP BY
                    memberId
            ) i ON i.memberId = members.id 
        SET members.outstandingBalance = COALESCE(i.outstandingBalance, 0)
        ${secondWhere}`
        
        await Database.update(query, params)
    }

    /**
     * Fetch all registrations with members with their corresponding (valid) registrations
     */
    static async getRegistrationWithMembersByIDs(ids: string[]): Promise<RegistrationWithMember[]> {
        if (ids.length === 0) {
            return []
        }
        let query = `SELECT ${Member.getDefaultSelect()}, ${Registration.getDefaultSelect()} from \`${Member.table}\`\n`;
        
        query += `JOIN \`${Registration.table}\` ON \`${Registration.table}\`.\`${Member.registrations.foreignKey}\` = \`${Member.table}\`.\`${Member.primary.name}\` AND (\`${Registration.table}\`.\`registeredAt\` is not null OR \`${Registration.table}\`.\`waitingList\` = 1)\n`

        // We do an extra join because we also need to get the other registrations of each member (only one regitration has to match the query)
        query += `where \`${Registration.table}\`.\`${Registration.primary.name}\` IN (?)`

        const [results] = await Database.select(query, [ids])
        const registrations: RegistrationWithMember[] = []

         // In the future we might add a 'reverse' method on manytoone relation, instead of defining the new relation. But then we need to store 2 model types in the many to one relation.
        const registrationMemberRelation = new ManyToOneRelation(Member, "member")
        registrationMemberRelation.foreignKey = Member.registrations.foreignKey

        for (const row of results) {
            const registration = Registration.fromRow(row[Registration.table])
            if (!registration) {
                throw new Error("Expected registration in every row")
            }

            const foundMember = Member.fromRow(row[Member.table])
            if (!foundMember) {
                throw new Error("Expected member in every row")
            }
            
            const _f = registration.setRelation(registrationMemberRelation, foundMember)           
            registrations.push(_f)
        }

        return registrations
    }

    /**
     * Fetch all registrations with members with their corresponding (valid) registrations
     */
    static async getRegistrationWithMembersForGroup(groupId: string, cycle: number): Promise<RegistrationWithMember[]> {
        let query = `SELECT ${Member.getDefaultSelect()}, ${Registration.getDefaultSelect()} from \`${Member.table}\`\n`;
        
        query += `JOIN \`${Registration.table}\` ON \`${Registration.table}\`.\`${Member.registrations.foreignKey}\` = \`${Member.table}\`.\`${Member.primary.name}\` AND (\`${Registration.table}\`.\`registeredAt\` is not null OR \`${Registration.table}\`.\`waitingList\` = 1)\n`

        // We do an extra join because we also need to get the other registrations of each member (only one regitration has to match the query)
        query += `where \`${Registration.table}\`.\`groupId\` = ? AND \`${Registration.table}\`.\`cycle\` = ?`

        const [results] = await Database.select(query, [groupId, cycle])
        const registrations: RegistrationWithMember[] = []

         // In the future we might add a 'reverse' method on manytoone relation, instead of defining the new relation. But then we need to store 2 model types in the many to one relation.
        const registrationMemberRelation = new ManyToOneRelation(Member, "member")
        registrationMemberRelation.foreignKey = Member.registrations.foreignKey

        for (const row of results) {
            const registration = Registration.fromRow(row[Registration.table])
            if (!registration) {
                throw new Error("Expected registration in every row")
            }

            const foundMember = Member.fromRow(row[Member.table])
            if (!foundMember) {
                throw new Error("Expected member in every row")
            }
            
            const _f = registration.setRelation(registrationMemberRelation, foundMember)           
            registrations.push(_f)
        }

        return registrations
    }

     /**
     * Fetch all registrations with members with their corresponding (valid) registrations and payment
     */
    static async getRegistrationWithMembersForPayment(paymentId: string): Promise<RegistrationWithMember[]> {
        const { BalanceItem, BalanceItemPayment} = await import('./');

        let query = `SELECT ${Member.getDefaultSelect()}, ${Registration.getDefaultSelect()} from \`${Member.table}\`\n`;
        
        query += `JOIN \`${Registration.table}\` ON \`${Registration.table}\`.\`${Member.registrations.foreignKey}\` = \`${Member.table}\`.\`${Member.primary.name}\`\n`
        
        query += `LEFT JOIN \`${BalanceItem.table}\` ON \`${BalanceItem.table}\`.\`registrationId\` = \`${Registration.table}\`.\`${Registration.primary.name}\`\n`
        query += `LEFT JOIN \`${BalanceItemPayment.table}\` ON \`${BalanceItemPayment.table}\`.\`${BalanceItemPayment.balanceItem.foreignKey}\` = \`${BalanceItem.table}\`.\`${BalanceItem.primary.name}\`\n`
        query += `JOIN \`${Payment.table}\` ON \`${Payment.table}\`.\`${Payment.primary.name}\` = \`${BalanceItemPayment.table}\`.\`${BalanceItemPayment.payment.foreignKey}\`\n`

        // We do an extra join because we also need to get the other registrations of each member (only one regitration has to match the query)
        query += `WHERE \`${Payment.table}\`.\`${Payment.primary.name}\` = ?\n`
        query += `GROUP BY \`${Registration.table}\`.\`${Registration.primary.name}\`, \`${Member.table}\`.\`${Member.primary.name}\``

        const [results] = await Database.select(query, [paymentId])
        const registrations: RegistrationWithMember[] = []

         // In the future we might add a 'reverse' method on manytoone relation, instead of defining the new relation. But then we need to store 2 model types in the many to one relation.
        const registrationMemberRelation = new ManyToOneRelation(Member, "member")
        registrationMemberRelation.foreignKey = Member.registrations.foreignKey

        for (const row of results) {
            const registration = Registration.fromRow(row[Registration.table])
            if (!registration) {
                throw new Error("Expected registration in every row")
            }

            const foundMember = Member.fromRow(row[Member.table])
            if (!foundMember) {
                throw new Error("Expected member in every row")
            }
            
            const _f = registration.setRelation(registrationMemberRelation, foundMember)           
            registrations.push(_f)
        }

        return registrations
    }

     /**
     * Fetch all members with their corresponding (valid) registrations, users
     */
    static async getBlobByIds(...ids: string[]): Promise<MemberWithRegistrations[]> {
        if (ids.length == 0) {
            return []
        }
        let query = `SELECT ${Member.getDefaultSelect()}, ${Registration.getDefaultSelect()}, ${User.getDefaultSelect()}  from \`${Member.table}\`\n`;
        query += `LEFT JOIN \`${Registration.table}\` ON \`${Registration.table}\`.\`${Member.registrations.foreignKey}\` = \`${Member.table}\`.\`${Member.primary.name}\` AND (\`${Registration.table}\`.\`registeredAt\` is not null OR \`${Registration.table}\`.\`waitingList\` = 1)\n`
        query += Member.users.joinQuery(Member.table, User.table)+"\n"

        // We do an extra join because we also need to get the other registrations of each member (only one regitration has to match the query)
        query += `where \`${Member.table}\`.\`${Member.primary.name}\` IN (?)`

        const [results] = await Database.select(query, [ids])
        const members: MemberWithRegistrations[] = []

        for (const row of results) {
            const foundMember = Member.fromRow(row[Member.table])
            if (!foundMember) {
                throw new Error("Expected member in every row")
            }
            const _f = foundMember.setManyRelation(Member.registrations as unknown as OneToManyRelation<"registrations", Member, Registration>, []).setManyRelation(Member.users, [])
            // Seach if we already got this member?
            const existingMember = members.find(m => m.id == _f.id)

            const member: MemberWithRegistrations = (existingMember ?? _f)
            if (!existingMember) {
                members.push(member)
            }

             // Check if we have a registration with a payment
            const registration = Registration.fromRow(row[Registration.table])
            if (registration) {
                // Check if we already have this registration
                if (!member.registrations.find(r => r.id == registration.id)) {
                    member.registrations.push(registration)
                }
            }

            // Check if we have a user
            const user = User.fromRow(row[User.table])
            if (user) {
                // Check if we already have this registration
                if (!member.users.find(r => r.id == user.id)) {
                    member.users.push(user)
                }
            }
        }

        return members

    }

    /**
     * Fetch all members with their corresponding (valid) registrations and payment
     */
    static async getFamilyWithRegistrations(id: string): Promise<MemberWithRegistrations[]> {
        let query = `SELECT l2.membersId as id from _members_users l1\n`;
        query += `JOIN _members_users l2 on l2.usersId = l1.usersId \n`
        query += `where l1.membersId = ? group by l2.membersId`

        const [results] = await Database.select(query, [id])
        const ids: string[] = []
        for (const row of results) {
            ids.push(row["l2"]["id"] as string)
        }

        if (!ids.includes(id)) {
            // Member has no users
            ids.push(id)
        }
        
        return await this.getBlobByIds(...ids)
    }

     /**
     * Fetch all members with their corresponding (valid) registrations or waiting lists and payments
     */
    static async getMembersWithRegistrationForUser(user: User): Promise<MemberWithRegistrations[]> {
        const query = SQL
            .select(
                SQL.column('id')
            )
            .from(SQL.table(Member.table))
            .join(
                SQL.leftJoin(
                    SQL.table('_members_users')
                ).where(
                    SQL.column('_members_users', 'membersId'),
                    SQL.column(Member.table, 'id'),
                )
            ).where(
                SQL.column('_members_users', 'usersId'),
                user.id,
            )

        const data = await query.fetch()
        return this.getBlobByIds(...data.map((r) => r.members.id as string));
    }

    getStructureWithRegistrations(this: MemberWithRegistrations, forOrganization: null | boolean = null) {
        return MemberWithRegistrationsBlob.create({
            ...this,
            registrations: this.registrations.map(r => r.getStructure()),
            details: this.details,
            users: this.users.map(u => UserStruct.create({
                ...u, 
                hasAccount: u.hasAccount()
            })),
        })
    }

    static getRegistrationWithMemberStructure(registration: RegistrationWithMember & {group: import('./Group').Group}): RegistrationWithMemberStruct {
        return RegistrationWithMemberStruct.create({
            ...registration.getStructure(),
            group: registration.group.getStructure(),
            cycle: registration.cycle,
            member: MemberStruct.create(registration.member),
        })
    }
}

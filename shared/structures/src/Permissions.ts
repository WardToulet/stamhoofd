import { AnyDecoder, ArrayDecoder, AutoEncoder, AutoEncoderPatchType, BooleanDecoder, EnumDecoder, field, MapDecoder, PatchMap, StringDecoder } from '@simonbackx/simple-encoding';
import { Formatter } from '@stamhoofd/utility';
import { v4 as uuidv4 } from "uuid";

import { Group } from './Group';
import { WebshopPreview } from './webshops/Webshop';

/**
 * PermissionLevels are used to grant permissions to specific resources or system wide
 */
export enum PermissionLevel {
    /** No access */
    None = "None",

    /** Read all data, but not allowed to write */
    Read = "Read",
    
    /** Read, write, add, delete child data, but not allowed to modify settings */
    Write = "Write",
    
    /** Full access */
    Full = "Full",
}

/**
 * More granular access rights to specific things in the system
 */
export enum AccessRight {
    // Platform level permissions
    /**
     * Allows the user to log in as a full-access admin to a specific organization
     */
    PlatformLoginAs = "PlatformLoginAs",

    // Organization level permissions
    OrganizationCreateWebshops = "OrganizationCreateWebshops",
    OrganizationManagePayments = "OrganizationManagePayments",
    OrganizationFinanceDirector = "OrganizationFinanceDirector",
    OrganizationCreateGroups = "OrganizationCreateGroups",

    // Member data access rights
    // Note: in order to read or write any data at all, a user first needs to have normal resource access to a group, category or organization
    // So general data (name, birthday, gender, address, email, parents, emergency contacts) access can be controlled in that way (this doesn't have a separate access right).
    MemberReadFinancialData = "MemberReadFinancialData",
    MemberWriteFinancialData = "MemberWriteFinancialData",

    // Webshop level permissions
    WebshopScanTickets = "WebshopScanTickets",
}

export class AccessRightHelper {
    static getName(right: AccessRight): string {
        switch (right) {
            case AccessRight.PlatformLoginAs: return 'Inloggen als hoofdbeheerder'
            case AccessRight.OrganizationFinanceDirector: return 'Toegang tot volledige boekhouding'
            case AccessRight.OrganizationManagePayments: return 'Overschrijvingen beheren'
            case AccessRight.OrganizationCreateWebshops: return 'Webshops maken'
            case AccessRight.OrganizationCreateGroups: return 'Groepen maken'
            case AccessRight.WebshopScanTickets: return 'Tickets scannen'

            // Member data
            case AccessRight.MemberReadFinancialData: return 'Bekijk rekening leden'
            case AccessRight.MemberWriteFinancialData: return 'Bewerk rekening leden'
        }
    }

    static getNameShort(right: AccessRight): string {
        switch (right) {
            case AccessRight.PlatformLoginAs: return 'Inloggen'
            case AccessRight.OrganizationFinanceDirector: return 'Boekhouding'
            case AccessRight.OrganizationManagePayments: return 'Overschrijvingen'
            case AccessRight.OrganizationCreateWebshops: return 'Maken'
            case AccessRight.OrganizationCreateGroups: return 'Maken'
            case AccessRight.WebshopScanTickets: return 'Scannen'

            // Member data
            case AccessRight.MemberReadFinancialData: return 'Lidgeld bekijken'
            case AccessRight.MemberWriteFinancialData: return 'Lidgeld bewerken'
        }
    }

    static getDescription(right: AccessRight): string {
        switch (right) {
            case AccessRight.PlatformLoginAs: return 'inloggen als hoofdbeheerder'
            case AccessRight.OrganizationFinanceDirector: return 'volledige boekhouding'
            case AccessRight.OrganizationManagePayments: return 'overschrijvingen'
            case AccessRight.OrganizationCreateWebshops: return 'webshops maken'
            case AccessRight.OrganizationCreateGroups: return 'groepen maken'
            case AccessRight.WebshopScanTickets: return 'scannen van tickets'

            // Member data
            case AccessRight.MemberReadFinancialData: return 'Openstaande bedragen bekijken'
            case AccessRight.MemberWriteFinancialData: return 'Openstaande bedragen bewerken'
        }
    }

    /**
     * If a user has a certain permission level, automatically grant the specific access right
     * By default only full permissions gives all access rights, but you can tweak it:
     * E.g., give webshop scan rights if you also have write access to that webshop
     */
    static autoGrantRightForLevel(right: AccessRight): PermissionLevel|null {
        switch (right) {
            case AccessRight.WebshopScanTickets: return PermissionLevel.Write
            case AccessRight.OrganizationCreateGroups: return null; // Not included in full access
        }
        return PermissionLevel.Full
    }

    /**
     * Automatically grant a user access rights if they have a certain right
     */
    static autoInheritFrom(right: AccessRight): AccessRight[] {
        switch (right) {
            // Finance director also has manage payments permissions automatically
            case AccessRight.OrganizationManagePayments: return [AccessRight.OrganizationFinanceDirector]
            
            // Finance director also can view and edit member financial data
            case AccessRight.MemberReadFinancialData: return [AccessRight.OrganizationFinanceDirector]
            case AccessRight.MemberWriteFinancialData: return [AccessRight.OrganizationFinanceDirector]
        }
        return []
    }
}

export function getPermissionLevelNumber(level: PermissionLevel): number {
    switch (level) {
        case PermissionLevel.None: return 0;
        case PermissionLevel.Read: return 1;
        case PermissionLevel.Write: return 2;
        case PermissionLevel.Full: return 3;
        default: {
            const l: never = level; // will throw compile error if new levels are added without editing this method
            throw new Error("Unknown permission level "+l);
        }
    }
}

export function getPermissionLevelName(level: PermissionLevel): string {
    switch (level) {
        case PermissionLevel.None: return 'Geen basistoegang';
        case PermissionLevel.Read: return 'Lezen';
        case PermissionLevel.Write: return 'Bewerken';
        case PermissionLevel.Full: return 'Volledige toegang';
        default: {
            const l: never = level; // will throw compile error if new levels are added without editing this method
            throw new Error("Unknown permission level "+l);
        }
    }
}

export class PermissionRole extends AutoEncoder {
    @field({ decoder: StringDecoder, defaultValue: () => uuidv4() })
    id: string;

    @field({ decoder: StringDecoder })
    name = "";
}


/**
 * More granular access rights to specific things in the system
 */
export enum PermissionsResourceType {
    Webshops = "Webshops",
    Groups = "Groups",
    GroupCategories = "GroupCategories",
    OrganizationCategories = "OrganizationCategories",
    RecordCategories = "RecordCategory"
}


export function getPermissionResourceTypeName(type: PermissionsResourceType, plural = true): string {
    switch (type) {
        case PermissionsResourceType.Webshops: return plural ? 'webshops' : 'webshop';
        case PermissionsResourceType.Groups: return plural ? 'inschrijvingsgroepen' : 'inschrijvingsgroep';
        case PermissionsResourceType.GroupCategories: return plural ? 'categorieën' : 'categorie';
        case PermissionsResourceType.OrganizationCategories: return plural ? 'verenigingcategorieën' : 'verenigingcategorie';
        case PermissionsResourceType.RecordCategories: return plural ? 'vragenlijsten' : 'vragenlijst';
    }
}

/**
 * More granular access rights to specific things in the system
 */
export class ResourcePermissions extends AutoEncoder {
    /**
     * This is a cache so we can display the role description without fetching all resources
     */
    @field({ decoder: StringDecoder, field: 'n' })
    resourceName = ""

    /**
     * Setting it to full gives all possible permissions for the resource
     * Read/Write depends on resource
     */
    @field({ decoder: new EnumDecoder(PermissionLevel), field: "l" })
    level: PermissionLevel = PermissionLevel.None

    /**
     * More granular permissions related to this resource
     */
    @field({ decoder: new ArrayDecoder(new EnumDecoder(AccessRight)), field: "r"})
    accessRights: AccessRight[] = []

    hasAccess(level: PermissionLevel): boolean {
        return getPermissionLevelNumber(this.level) >= getPermissionLevelNumber(level)
    }

    hasAccessRight(right: AccessRight): boolean {
        const gl = AccessRightHelper.autoGrantRightForLevel(right)
        return (gl && this.hasAccess(gl)) || this.accessRights.includes(right)
    }

    createInsertPatch(type: PermissionsResourceType, resourceId: string, roleOrPermissions: PermissionRoleDetailed):  AutoEncoderPatchType<PermissionRoleDetailed>
    createInsertPatch(type: PermissionsResourceType, resourceId: string, roleOrPermissions: Permissions): AutoEncoderPatchType<Permissions>
    createInsertPatch(type: PermissionsResourceType, resourceId: string, roleOrPermissions: PermissionRoleDetailed|Permissions): AutoEncoderPatchType<PermissionRoleDetailed>|AutoEncoderPatchType<Permissions> {
        const patch = roleOrPermissions.static.patch({}) as AutoEncoderPatchType<PermissionRoleDetailed>|AutoEncoderPatchType<Permissions>

        // First check if we need to insert the type
        if (roleOrPermissions.resources.get(type)) {
            // We need to patch
            const p = new PatchMap<string, ResourcePermissions|AutoEncoderPatchType<ResourcePermissions>|null>()
            p.set(resourceId, this)
            patch.resources.set(type, p)
        } else {
            // No resources with this type yet
            const p = new Map<string, ResourcePermissions>()
            p.set(resourceId, this)
            patch.resources.set(type, p)
        }
       
        return patch

    }
}

export class PermissionRoleDetailed extends PermissionRole {
    /**
     * Generic access to all resources
     */
    @field({ decoder: new EnumDecoder(PermissionLevel), version: 201 })
    level: PermissionLevel = PermissionLevel.None

    @field({ 
        decoder: new ArrayDecoder(new EnumDecoder(AccessRight)), 
        version: 246,
        upgrade: function() {
            const base: AccessRight[] = []
            if (this.legacyManagePayments) {
                base.push(AccessRight.OrganizationManagePayments);
            }

            if (this.legacyFinanceDirector) {
                base.push(AccessRight.OrganizationFinanceDirector);
            }

            if (this.legacyCreateWebshops) {
                base.push(AccessRight.OrganizationCreateWebshops);
            }
            return base;
        }
    })
    accessRights: AccessRight[] = []

    @field({ 
        decoder: new MapDecoder(
            new EnumDecoder(PermissionsResourceType), 
            new MapDecoder(
                // ID
                StringDecoder, 
                ResourcePermissions
            )
        ), 
        version: 248 
    })
    resources: Map<PermissionsResourceType, Map<string, ResourcePermissions>> = new Map()

    @field({ decoder: BooleanDecoder, field: 'managePayments', optional: true })
    legacyManagePayments = false

    @field({ decoder: BooleanDecoder, version: 199, field: 'financeDirector', optional: true })
    legacyFinanceDirector = false
    
    @field({ decoder: BooleanDecoder, field: 'createWebshops', optional: true })
    legacyCreateWebshops = false

    getDescription() {
        const stack: string[] = []
        if (this.level === PermissionLevel.Read) {
            stack.push("alles lezen")
        }
        if (this.level === PermissionLevel.Write) {
            stack.push("alles bewerken")
        }
        if (this.level === PermissionLevel.Full) {
            stack.push("alles")
        }

        for (const right of this.accessRights) {
            stack.push(AccessRightHelper.getDescription(right))
        }

        for (const [type, resources] of this.resources) {
            let count = 0
            for (const resource of resources.values()) {
                if (resource.hasAccess(PermissionLevel.Read) || resource.accessRights.length > 0) {
                    count += 1
                }
            }

            if (count > 0) {
                stack.push(count+" "+getPermissionResourceTypeName(type, count > 1))
            }
        }

        if (stack.length === 0) {
            return "geen toegang"
        }

        return Formatter.capitalizeFirstLetter(Formatter.joinLast(stack, ', ', ' en '))
    }

    hasAccess(level: PermissionLevel): boolean {
        return getPermissionLevelNumber(this.level) >= getPermissionLevelNumber(level)
    }

    hasAccessRight(right: AccessRight): boolean {
        const gl = AccessRightHelper.autoGrantRightForLevel(right)
        if ((gl && this.hasAccess(gl)) || this.accessRights.includes(right)) {
            return true;
        }

        const autoInherit = AccessRightHelper.autoInheritFrom(right)
        for (const r of autoInherit) {
            if (this.hasAccessRight(r)) {
                return true
            }
        }

        return false;
    }

    getResourcePermissions(type: PermissionsResourceType, id: string): ResourcePermissions|null {
        const resource = this.resources.get(type)
        if (!resource) {
            return null
        }
        const rInstance = resource.get(id)
        if (!rInstance) {
            return null
        }
        return rInstance
    }

    hasResourceAccess(type: PermissionsResourceType, id: string, level: PermissionLevel): boolean {
        if (this.hasAccess(level)) {
            return true;
        }

        return this.getResourcePermissions(type, id)?.hasAccess(level) ?? false
    }

    hasResourceAccessRight(type: PermissionsResourceType, id: string, right: AccessRight): boolean {
        if (this.hasAccessRight(right)) {
            return true
        }

        return  this.getResourcePermissions(type, id)?.hasAccessRight(right) ?? false
    }
}

/**
 * @deprecated
 * Use resource types
 * Give access to a given resouce based by the roles of a user
 */
export class PermissionsByRole extends AutoEncoder {
    @field({ decoder: new ArrayDecoder(PermissionRole) })
    read: PermissionRole[] = []

    @field({ decoder: new ArrayDecoder(PermissionRole) })
    write: PermissionRole[] = []

    @field({ decoder: new ArrayDecoder(PermissionRole) })
    full: PermissionRole[] = []

    getPermissionLevel(permissions: LoadedPermissions): PermissionLevel {
        if (permissions.hasFullAccess()) {
            return PermissionLevel.Full
        }

        for (const role of this.full) {
            if (permissions.roles.find(r => r.id === role.id)) {
                return PermissionLevel.Full
            }
        }

        if (permissions.hasWriteAccess()) {
            return PermissionLevel.Write
        }

        for (const role of this.write) {
            if (permissions.roles.find(r => r.id === role.id)) {
                return PermissionLevel.Write
            }
        }

        if (permissions.hasReadAccess()) {
            return PermissionLevel.Read
        }

        for (const role of this.read) {
            if (permissions.roles.find(r => r.id === role.id)) {
                return PermissionLevel.Read
            }
        }

        return PermissionLevel.None
    }

     /**
     * Whetever a given user has access to the members in this group. 
     */
    getRolePermissionLevel(role: PermissionRole): PermissionLevel {
        for (const r of this.full) {
            if (r.id === role.id) {
                return PermissionLevel.Full
            }
        }

        for (const r of this.write) {
            if (r.id === role.id) {
                return PermissionLevel.Write
            }
        }
        for (const r of this.read) {
            if (r.id === role.id) {
                return PermissionLevel.Read
            }
        }

        return PermissionLevel.None
    }

    hasAccess(permissions: LoadedPermissions|undefined|null, level: PermissionLevel): boolean {
        if (!permissions) {
            return false
        }
        return getPermissionLevelNumber(this.getPermissionLevel(permissions)) >= getPermissionLevelNumber(level)
    }

    roleHasAccess(role: PermissionRole, level: PermissionLevel = PermissionLevel.Read): boolean {
        return getPermissionLevelNumber(this.getRolePermissionLevel(role)) >= getPermissionLevelNumber(level)
    }

    hasFullAccess(permissions: LoadedPermissions|undefined|null): boolean {
        return this.hasAccess(permissions, PermissionLevel.Full)
    }

    hasWriteAccess(permissions: LoadedPermissions|undefined|null): boolean {
        return this.hasAccess(permissions, PermissionLevel.Write)
    }

    hasReadAccess(permissions: LoadedPermissions|undefined|null): boolean {
        return this.hasAccess(permissions, PermissionLevel.Read)
    }
}

export class Permissions extends AutoEncoder {
    /**
     * Automatically have all permissions (e.g. when someone created a new group)
     * Also allows creating new groups
     */
    @field({ decoder: new EnumDecoder(PermissionLevel) })
    level: PermissionLevel = PermissionLevel.None

    /**
     * @deprecated
     */
    @field({ decoder: new ArrayDecoder(AnyDecoder), optional: true })
    groups: never[] = []

    @field({ decoder: new ArrayDecoder(PermissionRole), version: 60 })
    roles: PermissionRole[] = []

    /**
     * Mostly for temporary access
     */
    @field({ 
        decoder: new MapDecoder(
            new EnumDecoder(PermissionsResourceType), 
            new MapDecoder(
                // ID
                StringDecoder, 
                ResourcePermissions
            )
        ), 
        version: 249
    })
    resources: Map<PermissionsResourceType, Map<string, ResourcePermissions>> = new Map()

    hasRole(role: PermissionRole): boolean {
        return this.roles.find(r => r.id === role.id) !== undefined
    }

    /**
     * @deprecated
     * Use LoadedPermissions
     */
    hasAccess(allRoles: PermissionRoleDetailed[], level: PermissionLevel): boolean {
        if (getPermissionLevelNumber(this.level) >= getPermissionLevelNumber(level)) {
            // Someone with read / write access for the whole organization, also the same access for each group
            return true;
        }

        for (const r of this.roles) {
            const f = allRoles.find(rr => r.id === rr.id)
            if (!f) {
                // Deleted role
                continue
            }
            if (getPermissionLevelNumber(f.level) >= getPermissionLevelNumber(level)) {
                return true
            }
        }

        return false
    }

    /**
     * @deprecated
     * Use LoadedPermissions
     */
    hasReadAccess(allRoles: PermissionRoleDetailed[]): boolean {
        return this.hasAccess(allRoles, PermissionLevel.Read)
    }

    /**
     * @deprecated
     * Use LoadedPermissions
     */
    hasWriteAccess(allRoles: PermissionRoleDetailed[]): boolean {
        return this.hasAccess(allRoles, PermissionLevel.Write)
    }

    /**
     * @deprecated
     * Use LoadedPermissions
     */
    hasFullAccess(allRoles: PermissionRoleDetailed[]): boolean {
        return this.hasAccess(allRoles, PermissionLevel.Full);
    }

    /**
     * @deprecated
     * Use LoadedPermissions
     */
    hasAccessRight(right: AccessRight, allRoles: PermissionRoleDetailed[]): boolean {
        if (this.hasFullAccess(allRoles)) {
            return true
        }
        for (const r of this.roles) {
            const f = allRoles.find(rr => r.id === rr.id)
            if (!f) {
                // Deleted role
                continue
            }
            if (f.hasAccessRight(right)) {
                return true
            }
        }

        return false
    }

    /**
     * @deprecated
     * @param roles All available roles of the organizatino (to query)
     */
    canCreateWebshops(allRoles: PermissionRoleDetailed[]): boolean {
        return this.hasAccessRight(AccessRight.OrganizationCreateWebshops, allRoles)
    }

    /**
     * @deprecated
     * @param roles All available roles of the organizatino (to query)
     */
    canManagePayments(allRoles: PermissionRoleDetailed[]): boolean {
        return this.hasAccessRight(AccessRight.OrganizationManagePayments, allRoles) || this.hasAccessRight(AccessRight.OrganizationFinanceDirector, allRoles)
    }

    /**
     * @deprecated
     */
    hasFinanceAccess(allRoles: PermissionRoleDetailed[]): boolean {
        return this.hasAccessRight(AccessRight.OrganizationFinanceDirector, allRoles)
    }

    add(other: Permissions) {
        if (getPermissionLevelNumber(this.level) < getPermissionLevelNumber(other.level)) {
            this.level = other.level;
        }

        for (const role of other.roles) {
            if (!this.roles.find(r => r.id === role.id)) {
                this.roles.push(role.clone());
            }
        }
    }
}

/**
 * Identical to Permissions but with detailed roles, loaded from the organization or platform
 */
export class LoadedPermissions {
    level: PermissionLevel = PermissionLevel.None
    roles: PermissionRoleDetailed[] = []
    resources: Map<PermissionsResourceType, Map<string, ResourcePermissions>> = new Map()

    constructor(data: Partial<LoadedPermissions>) {
        Object.assign(this, data)
    }

    static create(data: Partial<LoadedPermissions>) {
        return new LoadedPermissions(data)
    }

    static from(permissions: Permissions, allRoles: PermissionRoleDetailed[]) {
        return this.create({
            level: permissions.level,
            roles: permissions.roles.flatMap(role => {
                const d = allRoles.find(a => a.id === role.id);
                if (d) {
                    return [d]
                }
                return []
            }),
            resources: permissions.resources
        })
    }

    getResourcePermissions(type: PermissionsResourceType, id: string): ResourcePermissions|null {
        const resource = this.resources.get(type)
        if (!resource) {
            return null
        }
        const rInstance = resource.get(id)
        if (!rInstance) {
            return null
        }
        return rInstance
    }

    hasRole(role: PermissionRole): boolean {
        return this.roles.find(r => r.id === role.id) !== undefined
    }

    hasAccess(level: PermissionLevel): boolean {
        if (getPermissionLevelNumber(this.level) >= getPermissionLevelNumber(level)) {
            // Someone with read / write access for the whole organization, also the same access for each group
            return true;
        }

        for (const f of this.roles) {
            if (f.hasAccess(level)) {
                return true
            }
        }

        return false
    }

    hasResourceAccess(type: PermissionsResourceType, id: string, level: PermissionLevel): boolean {
        if (this.hasAccess(level)) {
            return true
        }

        if (this.getResourcePermissions(type, id)?.hasAccess(level) ?? false) {
            return true
        }

        for (const r of this.roles) {
            if (r.hasResourceAccess(type, id, level)) {
                return true
            }
        }

        return false
    }

    hasResourceAccessRight(type: PermissionsResourceType, id: string, right: AccessRight): boolean {
        if (this.hasAccessRight(right)) {
            return true
        }

        if (this.getResourcePermissions(type, id)?.hasAccessRight(right) ?? false) {
            return true
        }
        
        for (const r of this.roles) {
            if (r.hasResourceAccessRight(type, id, right)) {
                return true
            }
        }

        const autoInherit = AccessRightHelper.autoInheritFrom(right)
        for (const r of autoInherit) {
            if (this.hasResourceAccessRight(type, id, r)) {
                return true
            }
        }
        return false
    }

    hasReadAccess(): boolean {
        return this.hasAccess(PermissionLevel.Read)
    }

    hasWriteAccess(): boolean {
        return this.hasAccess(PermissionLevel.Write)
    }

    hasFullAccess(): boolean {
        return this.hasAccess(PermissionLevel.Full);
    }

    hasAccessRight(right: AccessRight): boolean {
        const gl = AccessRightHelper.autoGrantRightForLevel(right);
        if (gl && this.hasAccess(gl)) {
            return true
        }
        for (const f of this.roles) {
            if (f.hasAccessRight(right)) {
                return true
            }
        }

        const autoInherit = AccessRightHelper.autoInheritFrom(right)
        for (const r of autoInherit) {
            if (this.hasAccessRight(r)) {
                return true
            }
        }

        return false
    }
}

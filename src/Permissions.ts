import { ArrayDecoder, AutoEncoder, EnumDecoder, field, StringDecoder } from '@simonbackx/simple-encoding';

import { Group } from './Group';

export enum PermissionLevel {
    /** No access */
    None = "None",

    /** Read all data, but not allowed to write */
    Read = "Read",
    
    /** Write and write all data, but not allowed to modify settings */
    Write = "Write",
    
    /** Full access */
    Full = "Full",
}

export class GroupPermissions extends AutoEncoder {
    @field({ decoder: StringDecoder })
    groupId: string

    /**
     * Allow to read members and member details
     */
    @field({ decoder: new EnumDecoder(PermissionLevel) })
    level: PermissionLevel
}

export class Permissions extends AutoEncoder {
    /**
     * Automatically have all permissions (e.g. when someone created a new group)
     * Also allows creating new groups
     */
    @field({ decoder: new EnumDecoder(PermissionLevel) })
    level: PermissionLevel

    @field({ decoder: new ArrayDecoder(GroupPermissions) })
    groups: GroupPermissions[]

    hasReadAccess(group: Group | null = null) {
        if (this.level != PermissionLevel.None) {
            // Has read access
            return true
        }

        if (!group) {
            return false
        }

        const permission = this.groups.find(g => g.groupId === group.id)
        if (permission) {
            if (permission.level != PermissionLevel.None) {
                return true
            }
        }

        return false
    }

    hasWriteAccess(group: Group | null = null) {
        if (this.level == PermissionLevel.Write || this.level == PermissionLevel.Full) {
            // Has read access
            return true
        }

        if (!group) {
            return false
        }

        const permission = this.groups.find(g => g.groupId === group.id)
        if (permission) {
            if (permission.level == PermissionLevel.Write || permission.level == PermissionLevel.Full) {
                return true
            }
        }

        return false
    }

    hasFullAccess(group: Group | null = null) {
        if (this.level == PermissionLevel.Full) {
            // Has read access
            return true
        }

        if (!group) {
            return false
        }

        const permission = this.groups.find(g => g.groupId === group.id)
        if (permission) {
            if (permission.level == PermissionLevel.Full) {
                return true
            }
        }

        return false
    }
}
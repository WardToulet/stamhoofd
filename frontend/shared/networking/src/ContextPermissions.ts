import { AccessRight, Group, Organization, PaymentGeneral, PermissionLevel, Permissions, PermissionsResourceType, Platform, PlatformMember, User } from "@stamhoofd/structures";
import { Ref, unref } from "vue";

export class ContextPermissions {
    reactiveUser: User|null|Ref<User|null>
    reactiveOrganization: Organization|null|Ref<Organization|null>
    reactivePlatform: Platform|Ref<Platform>

    /**
     * Whether to allow inheriting platoform permissions
     * (mosty disabled when editing permissions)
     */
    allowInheritingPermissions = true
    
    constructor(
        user: User|null|undefined|Ref<User|null>, 
        organization: Organization|null|undefined|Ref<Organization|null>,
        platform: Platform|Ref<Platform>,
        options?: {allowInheritingPermissions?: boolean}
    ) {
        this.reactiveUser = user ?? null
        this.reactiveOrganization = organization ?? null
        this.reactivePlatform = platform
        if (options?.allowInheritingPermissions !== undefined) {
            this.allowInheritingPermissions = options.allowInheritingPermissions
        }
    }

    get user() {
        return unref(this.reactiveUser)
    }

    get userPermissions() {
        return this.user?.permissions ?? null
    }

    get organization() {
        return unref(this.reactiveOrganization)
    }

    get platform() {
        return unref(this.reactivePlatform)
    }

    get platformPermissions() {
        return unref(this.userPermissions)?.forPlatform(this.platform) ?? null
    }

    get permissions() {
        if (!this.organization) {
            return this.platformPermissions
        }
        return unref(this.userPermissions)?.forOrganization(this.organization, this.allowInheritingPermissions) ?? null
    }

    getPermissionsForOrganization(organization: Organization) {
        return unref(this.userPermissions)?.forOrganization(organization, this.allowInheritingPermissions) ?? null
    }

    get unloadedPermissions(): Permissions|null {
        if (!this.organization) {
            return unref(this.userPermissions)?.globalPermissions ?? null
        }
        return unref(this.userPermissions)?.organizationPermissions.get(this.organization.id) ?? null
    }

    hasFullAccess() {
        return this.permissions?.hasFullAccess() ?? false
    }

    hasFullPlatformAccess() {
        return this.platformPermissions?.hasFullAccess() ?? false
    }

    hasAccessRight(right: AccessRight) {
        return this.permissions?.hasAccessRight(right) ?? false
    }

    hasResourceAccessRight(resourceType: PermissionsResourceType, resourceId: string, right: AccessRight) {
        return this.permissions?.hasResourceAccessRight(resourceType, resourceId, right) ?? false
    }

    canManagePayments() {
        return this.hasAccessRight(AccessRight.OrganizationManagePayments) || this.hasAccessRight(AccessRight.OrganizationFinanceDirector)
    }

    canAccessGroup(group: Group, permissionLevel: PermissionLevel = PermissionLevel.Read) {
        if (!this.organization) {
            return false
        }

        return group.hasAccess(this.permissions, this.organization, permissionLevel)
    }

    canAccessPlatformMember(member: PlatformMember, permissionLevel: PermissionLevel = PermissionLevel.Read) {
        if (this.hasFullPlatformAccess()) {
            return true;
        }

        for (const registration of member.member.registrations) {
            const organization = member.family.getOrganization(registration.organizationId);
            if (organization) {
                const group = organization.groups.find(g => g.id === registration.groupId);
                if (group) {
                    if (group.hasAccess(this.getPermissionsForOrganization(organization), organization, permissionLevel)) {
                        return true;
                    }
                } else {
                    if (this.getPermissionsForOrganization(organization)?.hasAccess(permissionLevel)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    canAccessPayment(payment: PaymentGeneral|null|undefined, level: PermissionLevel) {
        if (this.canManagePayments() || this.hasFullAccess()) {
            return true;
        }

        if (!payment) {
            return false
        }

        if (this.organization) {
            for (const order of payment.orders) {
                const webshop = this.organization.webshops.find(w => w.id === order.webshopId)
                if (webshop && webshop.privateMeta.permissions.hasAccess(this.permissions, level)) {
                    return true
                }
            }

            for (const registration of payment.registrations) {
                const group = this.organization.groups.find(w => w.id === registration.groupId)

                if (group && group.privateSettings?.permissions.hasAccess(this.permissions, level)) {
                    return true
                }
            }
        }
        return false

    }
}

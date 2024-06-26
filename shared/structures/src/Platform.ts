import { ArrayDecoder, AutoEncoder, field, StringDecoder } from "@simonbackx/simple-encoding";

import { PermissionRoleDetailed } from "./Permissions";
import { User } from "./User";
import { OrganizationRecordsConfiguration } from "./members/OrganizationRecordsConfiguration";

export class PlatformPrivateConfig extends AutoEncoder {
    @field({ decoder: new ArrayDecoder(PermissionRoleDetailed) })
    roles: PermissionRoleDetailed[] = []
}

export class PlatformConfig extends AutoEncoder {
    @field({ decoder: OrganizationRecordsConfiguration, version: 253 })
    recordsConfiguration = OrganizationRecordsConfiguration.create({})
}


export class Platform extends AutoEncoder {
    static instance: Platform|null = null

    @field({ decoder: PlatformConfig })
    config: PlatformConfig = PlatformConfig.create({})

    @field({ decoder: PlatformPrivateConfig, nullable: true })
    privateConfig: PlatformPrivateConfig|null = null;

    /**
     * Keep admins accessible and in memory
     */
    admins?: User[]

    /**
     * If you don't have permissions, privateConfig will be null, so there won't be any roles either
     */
    getRoles() {
        return this.privateConfig?.roles ?? []
    }

    static get shared(): Platform {
        if (!Platform.instance) {
            Platform.instance = Platform.create({})
        }
        return Platform.instance
    }

    static get optionalShared(): Platform | null {
        return Platform.instance
    }

    static clearShared() {
        Platform.instance = null
    }

    setShared() {
        Platform.instance = this
    }
}

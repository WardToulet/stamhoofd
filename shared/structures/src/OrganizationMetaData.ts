import { ArrayDecoder,AutoEncoder, BooleanDecoder, DateDecoder,EnumDecoder, field, IntegerDecoder, StringDecoder } from '@simonbackx/simple-encoding';

import { File } from './files/File';
import { Image } from './files/Image';
import { GroupPrices } from './GroupPrices';
import { Record } from './members/Record';
import { RecordType, RecordTypeHelper } from './members/RecordType';
import { OrganizationGenderType } from './OrganizationGenderType';
import { OrganizationType } from './OrganizationType';
import { PaymentMethod } from './PaymentMethod';
import { UmbrellaOrganization } from './UmbrellaOrganization';
import { TransferSettings } from './webshops/TransferSettings';

export class OrganizationModules extends AutoEncoder {
    @field({ decoder: BooleanDecoder })
    useMembers = false

    @field({ decoder: BooleanDecoder })
    useWebshops = false
}

export enum AskRequirement {
    NotAsked = "NotAsked",
    Optional = "Optional",
    Required = "Required"
}

export class OrganizationRecordsConfiguration extends AutoEncoder {
    @field({ decoder: new ArrayDecoder(StringDecoder) })
    @field({ decoder: new ArrayDecoder(new EnumDecoder(RecordType)), upgrade: () => [], version: 55 })
    enabledRecords: RecordType[] = []

    /**
     * true: required
     * false: don't ask
     * null: optional
     */
    @field({ decoder: new EnumDecoder(AskRequirement), optional: true })
    doctor = AskRequirement.NotAsked

    /**
     * true: required
     * false: don't ask
     * null: optional
     */
    @field({ decoder: new EnumDecoder(AskRequirement), optional: true })
    emergencyContact = AskRequirement.Optional

    /**
     * Return true if at least one from the records should get asked
     */
    shouldAsk(...types: RecordType[]): boolean {
        for (const type of types) {
            if (this.enabledRecords.find(r => r === type)) {
                return true
            }

            if (type == RecordType.DataPermissions) {
                // Required if at least non oprivacy related record automatically
                if (this.needsData()) {
                    return true
                }
            }
        }
        return false
    }

    filterRecords(records: Record[], ...allow: RecordType[]): Record[] {
        return records.filter((r) => {
            if (allow.includes(r.type)) {
                return true
            }
            return this.shouldAsk(r.type)
        })
    }

    /**
     * Return true if we need to ask permissions for data, even when RecordType.DataPermissions is missing from enabledRecords
     */
    needsData(): boolean {
        if (this.doctor !== AskRequirement.NotAsked) {
            return true
        }
        if (this.enabledRecords.length == 0) {
            return false
        }

        if (this.enabledRecords.find(type => {
            if (![RecordType.DataPermissions, RecordType.MedicinePermissions, RecordType.PicturePermissions, RecordType.GroupPicturePermissions].includes(type)) {
                return true
            }
            return false
        })) {
            return true
        }
        return false
    }

    shouldSkipRecords(age: number | null): boolean {
        if (this.doctor !== AskRequirement.NotAsked) {
            return false
        }
        if (this.enabledRecords.length == 0) {
            return true
        }

        if (this.enabledRecords.length == 1 && (age === null || age >= 18)) {
            // Skip if the only record that should get asked is permission for medication
            return this.enabledRecords[0] === RecordType.MedicinePermissions
        }

        return false
    }

    /**
     * This fixes how inverted and special records are returned.
     * E.g. MedicalPermissions is returned if the member did NOT give permissions -> because we need to show a message
     * PicturePermissions is returned if no group picture permissions was given and normal picture permissions are disabled
     */
    filterForDisplay(records: Record[], age: number | null): Record[] {
        return this.filterRecords(
            Record.invertRecords(records), 
            ...(this.shouldAsk(RecordType.GroupPicturePermissions) ? [RecordType.PicturePermissions] : [])
        ).filter((record) => {
            // Some edge cases
            // Note: inverted types are already reverted here! -> GroupPicturePermissions means no permissions here
            
            if (record.type === RecordType.GroupPicturePermissions) {
                // When both group and normal pictures are allowed, hide the group pictures message
                if (this.shouldAsk(RecordType.PicturePermissions) && records.find(r => r.type === RecordType.PicturePermissions)) {
                    // Permissions for pictures -> this is okay
                    return false
                }

                if (!this.shouldAsk(RecordType.PicturePermissions)) {
                    // This is not a special case
                    return false
                }
            }

            // If no permissions for pictures but permissions for group pictures, only show the group message
            if (record.type === RecordType.PicturePermissions) {
                if (this.shouldAsk(RecordType.GroupPicturePermissions) && records.find(r => r.type === RecordType.GroupPicturePermissions)) {
                    // Only show the 'only permissions for group pictures' banner
                    return false
                }
            }


            // Member is older than 18 years, and no permissions for medicines
            if (record.type === RecordType.MedicinePermissions && (age ?? 18) >= 18) {
                return false
            }

            return true
        })
    }

    static getDefaultFor(type: OrganizationType): OrganizationRecordsConfiguration {
        if (type === OrganizationType.Youth) {
            // Enable all
            const records = Object.values(RecordType)

            return OrganizationRecordsConfiguration.create({
                enabledRecords: records,
                doctor: AskRequirement.Required,
                emergencyContact: AskRequirement.Optional
            })
        }

        if ([OrganizationType.Student ,OrganizationType.Sport, OrganizationType.Athletics, OrganizationType.Football, OrganizationType.Hockey, OrganizationType.Tennis, OrganizationType.Volleyball, OrganizationType.Swimming, OrganizationType.HorseRiding, OrganizationType.Basketball, OrganizationType.Dance, OrganizationType.Cycling, OrganizationType.Judo].includes(type)) {
            // Enable sport related records + pictures

            return OrganizationRecordsConfiguration.create({
                enabledRecords: [
                    RecordType.DataPermissions,
                    RecordType.PicturePermissions,

                    // Allergies
                    RecordType.FoodAllergies,
                    RecordType.MedicineAllergies,
                    RecordType.OtherAllergies,

                    // Health
                    RecordType.Asthma,
                    RecordType.Epilepsy,
                    RecordType.HeartDisease,
                    RecordType.Diabetes,
                    RecordType.SpecialHealthCare,
                    RecordType.Medicines,
                    RecordType.Rheumatism,
                    ...(type === OrganizationType.Swimming ? [RecordType.SkinCondition] : [RecordType.HayFever]),

                    RecordType.MedicinePermissions,

                    // Other
                    RecordType.Other,
                ],
                doctor: AskRequirement.Optional,
                emergencyContact: AskRequirement.Optional
            })
        }

         if (type === OrganizationType.LGBTQ) {
            // Request data permissions + emergency contact is optional
            return OrganizationRecordsConfiguration.create({
                enabledRecords: [RecordType.DataPermissions],
                doctor: AskRequirement.NotAsked,
                emergencyContact: AskRequirement.Optional
            })
        }

        // Others are all disabled by default
        return OrganizationRecordsConfiguration.create({})
    }
}


export class OrganizationMetaData extends AutoEncoder {
    @field({ decoder: new EnumDecoder(OrganizationType) })
    type: OrganizationType;

    @field({ decoder: OrganizationModules, version: 48, upgrade: () => OrganizationModules.create({ useMembers: true, useWebshops: true }) })
    modules = OrganizationModules.create({})

    @field({ decoder: new EnumDecoder(UmbrellaOrganization), nullable: true })
    umbrellaOrganization: UmbrellaOrganization | null = null;

    @field({ decoder: IntegerDecoder })
    expectedMemberCount = 0

    @field({ decoder: new EnumDecoder(OrganizationGenderType) })
    genderType: OrganizationGenderType = OrganizationGenderType.Mixed

    @field({ decoder: DateDecoder })
    defaultStartDate: Date

    @field({ decoder: DateDecoder })
    defaultEndDate: Date

    @field({ decoder: new ArrayDecoder(GroupPrices) })
    defaultPrices: GroupPrices[] = []

    @field({ decoder: StringDecoder, version: 6, upgrade: () => "", field: "iban" })
    @field({ 
        decoder: TransferSettings, 
        version: 50, 
        upgrade: (iban: string) => {
            return TransferSettings.create({
                iban: iban ? iban : null
            })
        },
        downgrade: (transferSettings: TransferSettings) => {
            return transferSettings.iban ?? ""
        }
    })
    transferSettings = TransferSettings.create({})

    /**
     * Logo used in a horizontal environment (e.g. menu bar)
     */
    @field({ decoder: Image, nullable: true, version: 11 })
    horizontalLogo: Image | null = null

    /**
     * Set either file or url for the privacy policy. If both are set, the url has priority
     */
    @field({ decoder: File, nullable: true, version: 25 })
    privacyPolicyFile: File | null = null

    @field({ decoder: StringDecoder, nullable: true, version: 25 })
    privacyPolicyUrl: string | null = null

    /**
     * Logo to display (small)
     */
    @field({ decoder: Image, nullable: true, version: 11 })
    squareLogo: Image | null = null

    @field({ decoder: StringDecoder, nullable: true, version: 21 })
    color: string | null = null

    @field({ decoder: new ArrayDecoder(new EnumDecoder(PaymentMethod)), version: 26 })
    paymentMethods: PaymentMethod[] = [PaymentMethod.Transfer]

    @field({ 
        decoder: OrganizationRecordsConfiguration, 
        version: 53, 
        upgrade: function(this: OrganizationMetaData) {
            return OrganizationRecordsConfiguration.getDefaultFor(OrganizationType.Youth)
        },
        defaultValue: () => OrganizationRecordsConfiguration.create({})
    })
    recordsConfiguration: OrganizationRecordsConfiguration
}

<template>
    <form id="signup-general-view" class="st-view" @submit.prevent="goNext">
        <STNavigationBar title="Stamhoofd gratis uitproberen">
            <button slot="right" type="button" class="button icon close gray" @click="pop" />
        </STNavigationBar>
        
        <main>
            <h1>
                Nieuwe vereniging aansluiten bij Stamhoofd
            </h1>
            <p>Een account maken duurt niet lang en is gratis. Je kiest zelf welke functies je gebruikt.</p>

            <STErrorsDefault :error-box="errorBox" />
            <div class="split-inputs">
                <div>
                    <STInputBox title="Naam van jouw vereniging" error-fields="name" :error-box="errorBox">
                        <input
                            id="organization-name"
                            ref="firstInput"
                            v-model="name"
                            class="input"
                            type="text"
                            placeholder="De naam van je vereniging"
                            autocomplete="organization"
                        >
                    </STInputBox>

                    <AddressInput v-model="address" title="Adres van je vereniging" :validator="validator" />
                    <p class="style-description-small">
                        Geen adres? Vul dan een adres in dat in de buurt ligt
                    </p>

                    <STInputBox v-if="false" title="Doorverwijzingscode" error-fields="registerCode" :error-box="errorBox">
                        <input
                            v-model="registerCode"
                            class="input"
                            type="text"
                            placeholder="Optioneel"
                            autocomplete="off"
                        >
                    </STInputBox>
                </div>

                <div>
                    <STInputBox title="Soort vereniging" error-fields="type" :error-box="errorBox">
                        <select v-model="type" class="input">
                            <option :value="null" disabled>
                                Maak een keuze
                            </option>

                            <optgroup v-for="group in availableTypes" :key="group.name" :label="group.name">
                                <option v-for="_type in group.types" :key="_type.value" :value="_type.value">
                                    {{ _type.name }}
                                </option>
                            </optgroup>
                        </select>
                    </STInputBox>
                    <p class="style-description-small">
                        Hiermee stellen we automatisch al enkele instellingen goed.
                    </p>

                    <STInputBox v-if="type == 'Youth'" title="Koepelorganisatie" error-fields="umbrellaOrganization" :error-box="errorBox">
                        <select v-model="umbrellaOrganization" class="input">
                            <option :value="null" disabled>
                                Maak een keuze
                            </option>
                            <option v-for="item in availableUmbrellaOrganizations" :key="item.value" :value="item.value">
                                {{ item.name }}
                            </option>
                        </select>
                    </STInputBox>
                </div>
            </div>

            <hr>
            <h2>Hoe ken je Stamhoofd?</h2>

            <Checkbox :checked="getBooleanType(AcquisitionType.Recommended)" @change="setBooleanType(AcquisitionType.Recommended, $event)">
                Op aanraden van andere vereniging / persoon
            </Checkbox>
            <Checkbox :checked="getBooleanType(AcquisitionType.Seen)" @change="setBooleanType(AcquisitionType.Seen, $event)">
                Gezien bij andere vereniging
            </Checkbox>
            <Checkbox :checked="getBooleanType(AcquisitionType.SocialMedia)" @change="setBooleanType(AcquisitionType.SocialMedia, $event)">
                Via sociale media
            </Checkbox>
            <Checkbox :checked="getBooleanType(AcquisitionType.Search)" @change="setBooleanType(AcquisitionType.Search, $event)">
                Via opzoekwerk (bv. Google)
            </Checkbox>
            <Checkbox :checked="getBooleanType(AcquisitionType.Other)" @change="setBooleanType(AcquisitionType.Other, $event)">
                Andere
            </Checkbox>
        </main>

        <STToolbar :sticky="false">
            <template #right>
                <LoadingButton :loading="loading">
                    <button class="button primary" @click.prevent="goNext">
                        Vereniging registreren
                    </button>
                </LoadingButton>
            </template>
        </STToolbar>
    </form>
</template>

<script lang="ts">
import { SimpleError } from '@simonbackx/simple-errors';
import { ComponentWithProperties, HistoryManager,NavigationMixin } from "@simonbackx/vue-app-navigation";
import { AddressInput, BackButton, CenteredMessage, Checkbox, ErrorBox, LoadingButton, Slider, STErrorsDefault, STInputBox, STNavigationBar, STToolbar, Validator } from "@stamhoofd/components"
import { NetworkManager } from '@stamhoofd/networking';
import { AcquisitionType, Address, Organization, OrganizationMetaData, OrganizationPrivateMetaData, OrganizationRecordsConfiguration, OrganizationType, OrganizationTypeHelper, UmbrellaOrganization, UmbrellaOrganizationHelper} from "@stamhoofd/structures"
import { Sorter } from '@stamhoofd/utility';
import { Component, Mixins, Prop } from "vue-property-decorator";

import SignupAccountView from './SignupAccountView.vue';

@Component({
    components: {
        STToolbar,
        STNavigationBar,
        Slider,
        STErrorsDefault,
        STInputBox,
        BackButton,
        AddressInput,
        LoadingButton,
        Checkbox
    }
})
export default class SignupGeneralView extends Mixins(NavigationMixin) {
    name = ""
    validator = new Validator()
    errorBox: ErrorBox | null = null
    address: Address | null = null
    acquisitionTypes: AcquisitionType[] = []

    @Prop({ default: "" })
    initialRegisterCode!: string;

    registerCode = this.initialRegisterCode
    loading = false

    type: OrganizationType | null = null
    umbrellaOrganization: UmbrellaOrganization | null = null

    mounted() {
        if (this.initialRegisterCode) {
            localStorage.setItem("savedRegisterCode", this.initialRegisterCode)
        }

        if (!this.initialRegisterCode) {
            const saved = localStorage.getItem("savedRegisterCode")
            if (saved !== null) {
                this.registerCode = saved
            }
        }

        if (this.registerCode.length > 0) {
            HistoryManager.setUrl("/aansluiten/"+encodeURIComponent(this.registerCode))
        } else {
            HistoryManager.setUrl("/aansluiten")   
        }
    }

    get AcquisitionType() {
        return AcquisitionType
    }

    async goNext() {
        
        try {
            if (this.name.length == 0) {
                throw new SimpleError({
                    code: "invalid_field",
                    message: "",
                    human: "Vul de naam van jouw vereniging in",
                    field: "name"
                })
            }
            if (this.name.length < 4) {
                throw new SimpleError({
                    code: "invalid_field",
                    message: "",
                    human: "De naam van jouw vereniging is te kort",
                     field: "name"
                })
            }

            if (this.type === null) {
                throw new SimpleError({
                    code: "invalid_field",
                    message: "Maak een keuze",
                    field: "type"
                })
            }

            if (this.umbrellaOrganization === null && this.type == OrganizationType.Youth) {
                throw new SimpleError({
                    code: "invalid_field",
                    message: "Maak een keuze",
                    field: "umbrellaOrganization"
                })
            }

            this.loading = true;
            this.errorBox = null

            if (!await this.validator.validate() || !this.address) {
                this.loading = false;
                return
            }

            // Check register code
            if (this.registerCode.length > 0) {
                try {
                    const response = await NetworkManager.server.request({
                        method: "GET",
                        path: "/register-code/"+encodeURIComponent(this.registerCode.toUpperCase()),
                    })
                } catch (e) {
                    this.errorBox = new ErrorBox(e)
                    this.loading = false;
                    return;
                }
            }

            const defaultStartDate = new Date()
            defaultStartDate.setMonth(defaultStartDate.getMonth() + 1)
            defaultStartDate.setDate(1)

            const defaultEndDate = new Date(defaultStartDate.getTime())
            defaultEndDate.setFullYear(defaultStartDate.getFullYear() + 1)

            const organization = Organization.create({
                name: this.name,
                uri: "", // ignored by backend for now
                meta: OrganizationMetaData.create({
                    type: this.type,
                    umbrellaOrganization: this.umbrellaOrganization,
                    recordsConfiguration: OrganizationRecordsConfiguration.getDefaultFor(this.type),
                    defaultStartDate,
                    defaultEndDate
                }),
                privateMeta: OrganizationPrivateMetaData.create({
                    acquisitionTypes: this.acquisitionTypes
                }),
                address: this.address,
                publicKey: "" // placeholder
            })

            this.loading = false;
            this.errorBox = null
            this.show(new ComponentWithProperties(SignupAccountView, { organization, registerCode: this.registerCode }))
            plausible('signupGeneral');
        } catch (e) {
            this.loading = false;
            console.error(e)
            this.errorBox = new ErrorBox(e)
            plausible('signupGeneralError');
            return;
        }
    }

    get availableTypes() {
        const types = OrganizationTypeHelper.getList().sort((a, b) => 
            Sorter.stack(
                Sorter.byBooleanValue(
                    !a.name.toLowerCase().startsWith("andere"), 
                    !b.name.toLowerCase().startsWith("andere")
                ), 
                Sorter.byStringProperty(a, b, "name")
            )
        );

        // Group by category
        const map = new Map<string, {
                value: OrganizationType;
                name: string;
            }[]>()

        for (const type of types) {
            const cat = OrganizationTypeHelper.getCategory(type.value)
            if (!map.has(cat)) {
                map.set(cat, [type])
            } else {
                map.get(cat)!.push(type)
            }
        }

        const keys = Array.from(map.keys()).sort(Sorter.byStringValue)

        return keys.map((key) => {
            const types = map.get(key)!
            return {
                name: key,
                types
            }
        })
    }

    get availableUmbrellaOrganizations() {
        return UmbrellaOrganizationHelper.getList().sort((a, b) => 
            Sorter.stack(
                Sorter.byBooleanValue(
                    !a.name.toLowerCase().startsWith("andere"), 
                    !b.name.toLowerCase().startsWith("andere")
                ), 
                Sorter.byStringProperty(a, b, "name")
            )
        )
    }

    async shouldNavigateAway() {
        if (await CenteredMessage.confirm("Ben je zeker dat je dit venster wilt sluiten?", "Sluiten")) {
            plausible('closeSignup');
            return true;
        }
        plausible('cancelCloseSignup');
        return false;
    }

     // Helpers ---

    getBooleanType(type: AcquisitionType) {
        return !!this.acquisitionTypes.find(r => r == type)
    }

    setBooleanType(type: AcquisitionType, enabled: boolean) {
        const index = this.acquisitionTypes.findIndex(r => r == type)
        if ((index != -1) === enabled) {
            return
        }
        
        if (enabled) {
            this.acquisitionTypes.push(type)
        } else {
            this.acquisitionTypes.splice(index, 1)
        }
    }
}
</script>

<style lang="scss">
@use "@stamhoofd/scss/base/variables.scss" as *;

#signup-general-view {
}
</style>

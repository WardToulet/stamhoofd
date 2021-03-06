<template>
    <form id="member-general-view" class="st-view" @submit.prevent="goNext">
        <STNavigationBar title="Inschrijven">
            <button slot="right" class="button icon gray close" type="button" @click="pop" />
        </STNavigationBar>
        
        <main>
            <h1 v-if="!member">
                Wie ga je inschrijven?
            </h1>
            <h1 v-else-if="wasInvalid">
                Gegevens aanvullen van {{ member.details ? member.details.firstName : member.firstName }}
            </h1>
            <h1 v-else-if="!member.details">
                Gegevens herstellen van {{ member.firstName }}
            </h1>
            <h1 v-else>
                Gegevens wijzigen van {{ member.details ? member.details.firstName : member.firstName }}
            </h1>

            <p v-if="member && !member.details" class="info-box">
                Jouw account beschikt niet meer over de sleutel om de gegevens van {{ member.firstName }} te ontcijferen. Dit kan voorkomen als je bijvoorbeeld je wachtwoord was vergeten, of als je ingelogd bent met een ander account dan je oorspronkelijk had gebruikt om {{ member.firstName }} in te schrijven. Je moet de gegevens daarom opnieuw ingeven.
            </p>

            <STErrorsDefault :error-box="errorBox" />
            <div class="split-inputs">
                <div>
                    <STInputBox title="Naam van het lid" error-fields="firstName,lastName" :error-box="errorBox">
                        <div class="input-group">
                            <div>
                                <input v-model="firstName" class="input" type="text" placeholder="Voornaam" autocomplete="given-name">
                            </div>
                            <div>
                                <input v-model="lastName" class="input" type="text" placeholder="Achternaam" autocomplete="family-name">
                            </div>
                        </div>
                    </STInputBox>

                    <BirthDayInput v-model="birthDay" title="Geboortedatum" :validator="validator" />

                    <STInputBox title="Identificeert zich als..." error-fields="gender" :error-box="errorBox">
                        <RadioGroup>
                            <Radio v-model="gender" value="Male" autocomplete="sex" name="sex">
                                Man
                            </Radio>
                            <Radio v-model="gender" value="Female" autocomplete="sex" name="sex">
                                Vrouw
                            </Radio>
                            <Radio v-model="gender" value="Other" autocomplete="sex" name="sex">
                                Andere
                            </Radio>
                        </RadioGroup>
                    </STInputBox>

                    <Checkbox v-if="livesAtParents || (age >= 18 && age <= 27)" v-model="livesAtParents">
                        Woont bij ouders
                    </Checkbox>
                </div>

                <div>
                    <AddressInput v-if="age >= 18 && !livesAtParents" v-model="address" title="Adres van dit lid" :validator="validator" />
                    <EmailInput v-if="age >= 11" v-model="email" title="E-mailadres van dit lid" :placeholder="age >= 18 ? 'Enkel van lid zelf': 'Optioneel. Enkel van lid zelf'" :required="age >= 18" :validator="validator" />
                    <PhoneInput v-if="age >= 11" v-model="phone" title="GSM-nummer van dit lid" :validator="validator" :required="age >= 18" :placeholder="age >= 18 ? 'Enkel van lid zelf': 'Optioneel. Enkel van lid zelf'" />
                </div>
            </div>
        </main>

        <STToolbar>
            <LoadingButton slot="right" :loading="loading">
                <button class="button primary">
                    Volgende
                </button>
            </LoadingButton>
        </STToolbar>
    </form>
</template>

<script lang="ts">
import { Decoder, ObjectData } from '@simonbackx/simple-encoding';
import { SimpleError, SimpleErrors } from '@simonbackx/simple-errors';
import { ComponentWithProperties, NavigationMixin } from "@simonbackx/vue-app-navigation";
import { AddressInput, BirthDayInput, Checkbox, EmailInput, ErrorBox, LoadingButton,PhoneInput, Radio, RadioGroup, Slider, STErrorsDefault, STInputBox, STNavigationBar, STToolbar, Validator } from "@stamhoofd/components"
import { SessionManager } from '@stamhoofd/networking';
import { Address, AskRequirement, EmergencyContact, Gender, MemberExistingStatus,MemberWithRegistrations, Record, RecordType, Version } from "@stamhoofd/structures"
import { MemberDetails } from '@stamhoofd/structures';
import { Component, Mixins, Prop } from "vue-property-decorator";

import { MemberManager } from '../../classes/MemberManager';
import { OrganizationManager } from '../../classes/OrganizationManager';
import EmergencyContactView from './EmergencyContactView.vue';
import MemberExistingQuestionView from './MemberExistingQuestionView.vue';
import MemberGroupView from './MemberGroupView.vue';
import MemberParentsView from './MemberParentsView.vue';
import MemberRecordsView from './MemberRecordsView.vue';

@Component({
    components: {
        STToolbar,
        STNavigationBar,
        Slider,
        STErrorsDefault,
        STInputBox,
        AddressInput,
        BirthDayInput,
        RadioGroup,
        Radio,
        PhoneInput,
        EmailInput,
        Checkbox,
        LoadingButton
    }
})
export default class MemberGeneralView extends Mixins(NavigationMixin) {
    @Prop({ default: null })
    initialMember!: MemberWithRegistrations | null

    member: MemberWithRegistrations | null = this.initialMember

    @Prop({ default: null })
    beforeCloseHandler: (() => void) | null;

    @Prop({ default: false })
    editOnly: boolean

    loading = false

    memberDetails: MemberDetails | null = null
   
    firstName = ""
    lastName = ""
    phone: string | null = null
    errorBox: ErrorBox | null = null

    // todo: replace withcomponent
    address: Address | null = null
    email: string | null = null
    birthDay: Date | null = null
    gender = Gender.Male
    livesAtParents = false
    validator = new Validator()

    wasInvalid = false

    mounted() {
        if (this.member) {
            if (this.member.details) {
                // Create a deep clone using encoding
                this.member = new ObjectData(this.member.encode({ version: Version }), { version: Version }).decode(MemberWithRegistrations as Decoder<MemberWithRegistrations>)
                this.memberDetails = this.member.details
            } else {
                this.firstName = this.member.firstName
            }
        } 

        if (this.memberDetails) {
            this.firstName = this.memberDetails.firstName
            this.lastName = this.memberDetails.lastName
            this.phone = this.memberDetails.phone
            this.address = this.memberDetails.address
            this.birthDay = this.memberDetails.birthDay
            this.gender = this.memberDetails.gender
            this.livesAtParents = !this.memberDetails.address && this.age >= 18
            this.email = this.memberDetails.email
        }

        if (!this.email) {
            // Recommend the current user's email
            this.email = SessionManager.currentSession?.user?.email ?? null
        }

        this.wasInvalid = !(this.member?.isCompleteForSelectedGroups(OrganizationManager.organization.groups) ?? true)
    }

    get age() {
        if (!this.birthDay) {
            return 0
        }
        const today = new Date();
        let age = today.getFullYear() - this.birthDay.getFullYear();
        const m = today.getMonth() - this.birthDay.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < this.birthDay.getDate())) {
            age--;
        }
        return age;
    }

    async goNext() {
        if (this.loading) {
            return;
        }
        let valid = await this.validator.validate()
        const errors = new SimpleErrors()
        if (this.firstName.length < 2) {
            errors.addError(new SimpleError({
                code: "invalid_field",
                message: "Vul de voornaam in",
                field: "firstName"
            }))
        }
        if (this.lastName.length < 2) {
            errors.addError(new SimpleError({
                code: "invalid_field",
                message: "Vul de achternaam in",
                field: "lastName"
            }))
        }
        
        if (valid && !this.birthDay) {
            // Security check in case event based validation fails
            // no translations needed here, since this is an edge case
            errors.addError(new SimpleError({
                code: "invalid_field",
                message: "Birthday check failed",
            }))
        }

        if (errors.errors.length > 0) {
            this.errorBox = new ErrorBox(errors)
            valid = false
        } else {
            this.errorBox = null
        }

        if (!valid) {
            return
        }

        if (this.memberDetails) {
            // Keep all that was already chagned in next steps
            this.memberDetails.firstName = this.firstName
            this.memberDetails.lastName = this.lastName
            this.memberDetails.gender = this.gender
            this.memberDetails.phone = this.phone
            this.memberDetails.birthDay = this.birthDay!
            this.memberDetails.email = this.age >= 18 ? this.email : null
            this.memberDetails.address = this.livesAtParents ? null : this.address
        } else {
            this.memberDetails = MemberDetails.create({
                firstName: this.firstName,
                lastName: this.lastName,
                gender: this.gender,
                phone: this.phone,
                email: this.age >= 18 ? this.email : null,
                birthDay: this.birthDay!,
                address: this.livesAtParents ? null : this.address
            })
        }

        if (this.member) {
            // Double check if everything is synced
            this.member.details = this.memberDetails
        }
        
        if (!this.editOnly && (!this.member || !this.member.hasActiveRegistrations())) {
            if (!(await this.saveData(this))) {
                return;
            }

            // Automatically fill in member existing status if not set or expired
            if ((this.memberDetails.existingStatus === null || this.memberDetails.existingStatus.isExpired())) {
                this.memberDetails.existingStatus = null;

                if (this.member && this.member.inactiveRegistrations.length > 0) {
                    // Are these registrations active?
                    this.memberDetails.existingStatus = MemberExistingStatus.create({
                        isNew: false,
                        hasFamily: false, // unknown (doesn't matter atm if not new)
                    })
                }
            }

            // Check if we need to ask existing status
            const shouldAsk = !!this.member!.getSelectableGroups(OrganizationManager.organization.groups).find(g => g.askExistingStatus)

            if (!shouldAsk) {
                this.chooseGroup(this)
            } else {
                this.askExistingStatus(this);
            }
            return;
        } else {
            await this.goToParents(this);
        }
    }

    askExistingStatus(component: NavigationMixin) {
        component.show(new ComponentWithProperties(MemberExistingQuestionView, {
            member: this.memberDetails,
            handler: (component) => {
                this.chooseGroup(component, true)
            }
        }))
    }

    chooseGroup(component: NavigationMixin, replace = false) {
        this.navigationController?.push(new ComponentWithProperties(MemberGroupView, { 
            member: this.member,
            handler: (component: MemberGroupView) => {
                this.goToParents(component).catch(e => {
                    console.error(e)
                })
            }
        }), true, replace ? (this.navigationController.components.length - 1) : 0)
        return;
    }

    async saveData(component: { loading: boolean; errorBox: ErrorBox | null }) {
        if (!this.memberDetails) {
            return false;
        }

        const o = this.memberDetails
        component.loading = true
        
        try {
            if (this.member) {
                await MemberManager.patchAllMembersWith(this.member)
            } else {
                const m = await MemberManager.addMember(this.memberDetails)
                if (!m) {
                    throw new SimpleError({
                        code: "expected_member",
                        message: "Er ging iets mis bij het opslaan."
                    })
                }
                this.member = m
                this.memberDetails = m.details
            }

            component.errorBox = null
            component.loading = false;
            return true
        } catch (e) {
            component.errorBox = new ErrorBox(e)
            component.loading = false;
            return false;
        }
    }

    async goToEmergencyContact(component: NavigationMixin & { loading: boolean; errorBox: ErrorBox | null }) {
        const memberDetails = this.member!.details!

        if (OrganizationManager.organization.meta.recordsConfiguration.emergencyContact === AskRequirement.NotAsked) {
            // go to the steekkaart view
            await this.goToRecords(component)
            return
        }
        // Noodcontacten
        component.show(new ComponentWithProperties(EmergencyContactView, { 
            contact: memberDetails.emergencyContacts.length > 0 ? memberDetails.emergencyContacts[0] : null,
            handler: async (contact: EmergencyContact | null, component: EmergencyContactView) => {
                if (contact) {
                    memberDetails.emergencyContacts = [contact]
                } else {
                    memberDetails.emergencyContacts = []
                }
                
                // go to the steekkaart view
                await this.goToRecords(component)
            }
        }))
    }

    async goToRecords(component: NavigationMixin & { loading: boolean; errorBox: ErrorBox | null }) {
        if (OrganizationManager.organization.meta.recordsConfiguration.shouldSkipRecords(this.member?.details?.age ?? null)) {
            // Skip records
            this.member!.details!.records = []
            this.member!.details!.lastReviewed = new Date()

            await MemberManager.patchAllMembersWith(this.member!)
            component.dismiss({ force: true })

            return
        }

        // go to the steekkaart view
        component.show(new ComponentWithProperties(MemberRecordsView, { 
            member: this.member
        }))
    }

    async goToParents(component: NavigationMixin & { loading: boolean; errorBox: ErrorBox | null }) {
        if (!this.memberDetails) {
            return;
        }

        // Already save here
        if (!(await this.saveData(component))) {
            return;
        }

        if (!this.member) {
            // we should always have a member
            console.error("Expected to have a member at the end of the general view")
            return;
        }

        // Check if we need to stop here (e.g. because we are only going to register on a waiting list
        if (!this.member.shouldAskDetails(OrganizationManager.organization.groups)) {
            console.info("Closed general view because we are signing up for a waiting list")
            this.dismiss({ force: true })
            return;
        }

        const memberDetails = this.member.details!
        // todo: check age before asking parents
        if ((memberDetails.age ?? 99) < 18 || this.livesAtParents) {
            component.show(new ComponentWithProperties(MemberParentsView, { 
                member: this.member,
                handler: async (component: MemberParentsView) => {
                    await this.goToEmergencyContact(component)
                }
            }))
        } else {
            await this.goToEmergencyContact(component)
        }
    }

    shouldNavigateAway() {
        if (confirm("Ben je zeker dat je dit venster wilt sluiten?")) {
            return true;
        }
        return false;
    }

    destroyed() {
        console.log("destroyed")
        if (this.beforeCloseHandler) this.beforeCloseHandler()
    }
}
</script>

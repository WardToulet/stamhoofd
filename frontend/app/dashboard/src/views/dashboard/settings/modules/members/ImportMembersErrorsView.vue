<template>
    <div id="import-members-errors-view" class="st-view background">
        <STNavigationBar title="Kijk deze fouten na" />

        <main>
            <h1>Kijk deze fouten na</h1>
            <p>In sommige rijen hebben we gegevens gevonden die we niet 100% goed konden interpreteren. Kijk hieronder na waar je nog wijzigingen moet aanbrengen en pas het aan in jouw bestand.</p>

            <table class="data-table">
                <thead>
                    <tr>
                        <th>
                            Fout
                        </th>
                        <th>Cel</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(error, index) in errors" :key="index">
                        <td>
                            {{ error.message }}
                        </td>
                        <td class="nowrap">
                            {{ error.cellPath }}
                        </td>
                    </tr>
                </tbody>
            </table>

            
            <STErrorsDefault :error-box="errorBox" />
        </main>

        <STToolbar>
            <template #right>
                <LoadingButton :loading="saving">
                    <button class="button primary" type="button" @click="pop">
                        Nieuw bestand uploaden
                    </button>
                </LoadingButton>
            </template>
        </STToolbar>
    </div>
</template>

<script lang="ts">
import { AutoEncoder, AutoEncoderPatchType } from '@simonbackx/simple-encoding';
import { NavigationMixin } from "@simonbackx/vue-app-navigation";
import { Component, Mixins, Prop } from "@simonbackx/vue-app-navigation/classes";
import { BackButton, Checkbox, ErrorBox, LoadingButton, Radio, RadioGroup, STErrorsDefault,STInputBox, STNavigationBar, STToolbar, Validator} from "@stamhoofd/components";
import { Organization, OrganizationPatch } from "@stamhoofd/structures"

import { ImportError } from '../../../../../classes/import/ImportingMember';


@Component({
    components: {
        STNavigationBar,
        STToolbar,
        STInputBox,
        RadioGroup,
        Radio,
        STErrorsDefault,
        Checkbox,
        BackButton,
        LoadingButton
    },
})
export default class ImportMembersErrorsView extends Mixins(NavigationMixin) {
    errorBox: ErrorBox | null = null
    validator = new Validator()
    saving = false
    organizationPatch: AutoEncoderPatchType<Organization> & AutoEncoder = OrganizationPatch.create({})

    created() {
        this.organizationPatch.id = this.$organization.id
    }

    @Prop({ required: true })
        errors: ImportError[]

    get organization() {
        return this.$organization.patch(this.organizationPatch)
    }
}
</script>

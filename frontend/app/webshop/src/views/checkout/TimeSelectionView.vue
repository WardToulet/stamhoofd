<template>
    <div class="boxed-view">
        <div class="st-view">
            <main>
                <h1 v-if="checkoutMethod.type == 'Takeout'">
                    Kies je afhaaltijdstip
                </h1>
                <h1 v-else-if="checkoutMethod.type == 'Delivery'">
                    Kies je leveringstijdstip
                </h1>

                <p v-if="checkoutMethod.type == 'Takeout'">
                    Afhaallocatie: {{ checkoutMethod.name ? checkoutMethod.name + ',' : '' }} {{ checkoutMethod.address }}
                </p>
                
                <STErrorsDefault :error-box="errorBox" />

                <STList>
                    <STListItem v-for="(slot, index) in timeSlots" :key="index" :selectable="true" element-name="label" class="right-stack left-center">
                        <Radio slot="left" v-model="selectedSlot" name="choose-time-slot" :value="slot" />
                        <h2 class="style-title-list">
                            {{ slot.date | dateWithDay }}
                        </h2> 
                        <p class="style-description">
                            Tussen {{ slot.startTime | minutes }} - {{ slot.endTime | minutes }}
                        </p>
                    </STListItem>
                </STList>
            </main>

            <STToolbar>
                <LoadingButton slot="right" :loading="loading">
                    <button class="button primary" @click="goNext">
                        <span>Doorgaan</span>
                        <span class="icon arrow-right" />
                    </button>
                </LoadingButton>
            </STToolbar>
        </div>
    </div>
</template>

<script lang="ts">
import { Decoder } from '@simonbackx/simple-encoding';
import { SimpleError } from '@simonbackx/simple-errors';
import { ComponentWithProperties,HistoryManager,NavigationController,NavigationMixin } from "@simonbackx/vue-app-navigation";
import { ErrorBox, LoadingButton, Radio, STErrorsDefault,STList, STListItem, STNavigationBar, STToolbar } from "@stamhoofd/components"
import { SessionManager } from '@stamhoofd/networking';
import { Group, KeychainedResponse, MemberWithRegistrations, Payment, PaymentMethod, PaymentStatus, Record, RecordType, RegisterMember, RegisterMembers, RegisterResponse, SelectedGroup, WebshopTakeoutMethod, WebshopTimeSlot, WebshopTimeSlots } from '@stamhoofd/structures';
import { Formatter } from '@stamhoofd/utility';
import { Component, Mixins,  Prop,Vue } from "vue-property-decorator";

import { CheckoutManager } from '../../classes/CheckoutManager';
import { WebshopManager } from '../../classes/WebshopManager';
import { CheckoutStepsManager, CheckoutStepType } from './CheckoutStepsManager';

@Component({
    components: {
        STNavigationBar,
        STToolbar,
        STList,
        STListItem,
        Radio,
        LoadingButton,
        STErrorsDefault
    },
    filters: {
        dateWithDay: (d: Date) => Formatter.capitalizeFirstLetter(Formatter.dateWithDay(d)),
        minutes: Formatter.minutes.bind(Formatter)
    }
})
export default class TimeSelectionView extends Mixins(NavigationMixin){
    step = -1

    loading = false
    errorBox: ErrorBox | null = null
    CheckoutManager = CheckoutManager

    get checkoutMethod() {
        return CheckoutManager.checkout.checkoutMethod!
    }

    get timeSlots(): WebshopTimeSlot[] {
        return CheckoutManager.checkout.checkoutMethod!.timeSlots.timeSlots.sort(WebshopTimeSlot.sort)
    }

    get selectedSlot(): WebshopTimeSlot {
        return CheckoutManager.checkout.timeSlot ?? this.timeSlots[0]
    }

    set selectedSlot(timeSlot: WebshopTimeSlot) {
        CheckoutManager.checkout.timeSlot = timeSlot
        CheckoutManager.saveCheckout()
    }

    get webshop() {
        return WebshopManager.webshop
    }

    async goNext() {
        if (this.loading || !this.selectedSlot) {
            return
        }
        // Force checkout save
        this.selectedSlot = this.selectedSlot as any
        this.loading = true
        this.errorBox = null

        try {
            const nextStep = CheckoutStepsManager.getNextStep(CheckoutStepType.Time)
            if (!nextStep) {
                throw new SimpleError({
                    code: "missing_config",
                    message: "Er ging iets mis bij het ophalen van de volgende stap"
                })
            }
            const comp = await nextStep.getComponent()

            this.show(new ComponentWithProperties(comp, {}))
            
        } catch (e) {
            console.error(e)
            this.errorBox = new ErrorBox(e)
        }
        this.loading = false
    }

    mounted() {
        HistoryManager.setUrl(WebshopManager.webshop.getUrlSuffix()+"/checkout/"+CheckoutStepType.Time.toLowerCase())
    }

    activated() {
        // For an unknown reason, we need to set a timer to properly update the URL...
        window.setTimeout(() => {
            HistoryManager.setUrl(WebshopManager.webshop.getUrlSuffix()+"/checkout/"+CheckoutStepType.Time.toLowerCase())
        }, 100);
    }
}
</script>

<style lang="scss">
@use "@stamhoofd/scss/base/variables.scss" as *;
@use "@stamhoofd/scss/base/text-styles.scss" as *;


</style>
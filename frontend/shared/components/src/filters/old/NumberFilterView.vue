<template>
    <STList>
        <STListItem :selectable="true" element-name="label">
            <template #left>
                <Radio v-model="filter.mode" :name="filter.id" :value="NumberFilterMode.Equal" @change="onChange" />
            </template>
            <p class="style-title-list">
                Gelijk aan...
            </p>
            <NumberInput v-if="filter.mode === NumberFilterMode.Equal" ref="input" v-model="filter.start" :min="null" :max="null" :required="true" :floating-point="floatingPoint" :stepper="!floatingPoint" placeholder="Vul getal in" class="option" />
        </STListItem>

        <STListItem :selectable="true" element-name="label">
            <template #left>
                <Radio v-model="filter.mode" :name="filter.id" :value="NumberFilterMode.NotEqual" @change="onChange" />
            </template>
            <p class="style-title-list">
                Niet gelijk aan...
            </p>

            <NumberInput v-if="filter.mode === NumberFilterMode.NotEqual" ref="input" v-model="filter.start" :min="null" :max="null" :required="true" :floating-point="floatingPoint" :stepper="!floatingPoint" placeholder="Vul getal in" class="option" />
        </STListItem>

        <STListItem :selectable="true" element-name="label">
            <template #left>
                <Radio v-model="filter.mode" :name="filter.id" :value="NumberFilterMode.GreaterThan" @change="onChange" />
            </template>
            <p class="style-title-list">
                Groter of gelijk aan...
            </p>

            <NumberInput v-if="filter.mode === NumberFilterMode.GreaterThan" ref="input" v-model="filter.start" :min="null" :max="null" :floating-point="floatingPoint" :stepper="!floatingPoint" placeholder="Vul een getal in" class="option" />
        </STListItem>

        <STListItem :selectable="true" element-name="label">
            <template #left>
                <Radio v-model="filter.mode" :name="filter.id" :value="NumberFilterMode.LessThan" @change="onChange" />
            </template>
            <p class="style-title-list">
                Kleiner of gelijk aan...
            </p>

            <NumberInput v-if="filter.mode === NumberFilterMode.LessThan" ref="input" v-model="filter.end" :min="null" :max="null" :floating-point="floatingPoint" :stepper="!floatingPoint" placeholder="Vul een getal in" class="option" />
        </STListItem>

        <STListItem :selectable="filter.mode !== NumberFilterMode.Between" :element-name="filter.mode === NumberFilterMode.Between ? 'div' : 'label'">
            <template #left>
                <Radio v-model="filter.mode" :name="filter.id" :value="NumberFilterMode.Between" @change="onChange" />
            </template>
            <p class="style-title-list">
                Tussen...
            </p>

            <NumberInput v-if="filter.mode === NumberFilterMode.Between" ref="input" v-model="filter.start" :min="null" :max="null" :floating-point="floatingPoint" :stepper="!floatingPoint" placeholder="Van" class="option" />
            <NumberInput v-if="filter.mode === NumberFilterMode.Between" v-model="filter.end" :min="filter.start" :max="null" :floating-point="floatingPoint" :stepper="!floatingPoint" placeholder="Tot" class="option" />
        </STListItem>

        <STListItem :selectable="true" element-name="label">
            <template #left>
                <Radio v-model="filter.mode" :name="filter.id" :value="NumberFilterMode.NotBetween" @change="onChange" />
            </template>
            <p class="style-title-list">
                Niet tussen...
            </p>

            <NumberInput v-if="filter.mode === NumberFilterMode.NotBetween" ref="input" v-model="filter.start" :min="null" :max="null" :required="filter.end === null" :floating-point="floatingPoint" :stepper="!floatingPoint" placeholder="Vanaf" class="option" />
            <NumberInput v-if="filter.mode === NumberFilterMode.NotBetween" v-model="filter.end" :min="filter.start" :max="null" :required="filter.start === null" :floating-point="floatingPoint" :stepper="!floatingPoint" placeholder="Tot" class="option" />
        </STListItem>
    </STList>
</template>


<script lang="ts">
import { NumberFilter, NumberFilterMode } from "@stamhoofd/structures";
import { Component, Prop,Vue } from "@simonbackx/vue-app-navigation/classes";

import NumberInput from "../../inputs/NumberInput.vue";
import Radio from "../../inputs/Radio.vue";
import STList from "../../layout/STList.vue";
import STListItem from "../../layout/STListItem.vue";

@Component({
    components: {
        STListItem,
        STList,
        Radio,
        NumberInput
    }
})
export default class NumberFilterView extends Vue {
    @Prop({ required: true }) 
        filter: NumberFilter<any>

    get NumberFilterMode() {
        return NumberFilterMode
    }

    get floatingPoint() {
        return this.filter.definition.floatingPoint
    }

    get currency() {
        return this.filter.definition.currency
    }

    async onChange() {
        await this.$nextTick();
        (this.$refs["input"] as any).focus()
    }

}
</script>
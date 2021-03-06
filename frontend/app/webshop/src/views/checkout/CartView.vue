<template>
    <div class="st-view cart-view">
        <STNavigationBar :title="title">
            <span v-if="cart.items.length > 0" slot="left" class="style-tag">{{ cart.price | price }}</span>
            <button slot="right" class="button icon close gray" @click="pop" />
        </STNavigationBar>
        <main>
            <h1>{{ title }}</h1>

            <p v-if="cart.items.length == 0" class="info-box">
                Jouw winkelmandje is leeg. Ga terug en klik op een product om iets toe te voegen.
            </p>
            <STErrorsDefault :error-box="errorBox" />
           
            <STList>
                <STListItem v-for="cartItem in cart.items" :key="cartItem.id" class="cart-item-row" :selectable="true" @click="editCartItem(cartItem)">
                    <h3>
                        <span>{{ cartItem.product.name }}</span>
                        <span class="icon arrow-right-small gray" />
                    </h3>
                    <p v-if="cartItem.description" class="description" v-text="cartItem.description" />

                    <footer>
                        <p class="price">
                            {{ cartItem.amount }} x {{ cartItem.unitPrice | price }}
                        </p>
                        <div @click.stop>
                            <button class="button icon trash gray" @click="deleteItem(cartItem)" />
                            <StepperInput v-model="cartItem.amount" :min="1" :max="maximumRemainingFor(cartItem)" @click.native.stop />
                        </div>
                    </footer>

                    <figure v-if="imageSrc(cartItem)" slot="right">
                        <img :src="imageSrc(cartItem)">
                    </figure>
                </STListItem>
            </STList>
        </main>

        <STToolbar v-if="cart.items.length > 0">
            <span slot="left">Totaal: {{ cart.price | price }}</span>
            <LoadingButton slot="right" :loading="loading">
                <button class="button primary" @click="goToCheckout">
                    <span class="icon flag" />
                    <span>Bestellen</span>
                </button>
            </LoadingButton>
        </STToolbar>
    </div>
</template>


<script lang="ts">
import { ComponentWithProperties, HistoryManager, NavigationController, NavigationMixin } from '@simonbackx/vue-app-navigation';
import { ErrorBox, LoadingButton,StepperInput,STErrorsDefault,STList, STListItem,STNavigationBar, STToolbar, Toast } from '@stamhoofd/components';
import { CartItem, Version } from '@stamhoofd/structures';
import { Formatter } from '@stamhoofd/utility';
import { Component } from 'vue-property-decorator';
import { Mixins } from 'vue-property-decorator';

import { CheckoutManager } from '../../classes/CheckoutManager';
import { GlobalEventBus } from '../../classes/EventBus';
import { WebshopManager } from '../../classes/WebshopManager';
import CartItemView from '../products/CartItemView.vue';

@Component({
    components: {
        STNavigationBar,
        STToolbar,
        STList,
        STListItem,
        STErrorsDefault,
        LoadingButton,
        StepperInput
    },
    filters: {
        price: Formatter.price.bind(Formatter),
        priceChange: Formatter.priceChange.bind(Formatter)
    }
})
export default class CartView extends Mixins(NavigationMixin){
    CheckoutManager = CheckoutManager

    title = "Winkelmandje"
    loading = false
    errorBox: ErrorBox | null = null

    get cart() {
        return this.CheckoutManager.cart
    }

    async goToCheckout() { 
        if (this.loading) {
            return
        }
        this.loading = true
        this.errorBox = null

         try {
            await GlobalEventBus.sendEvent("checkout", "cart")
            this.dismiss({ force: true })
        } catch (e) {
            console.error(e)
            this.errorBox = new ErrorBox(e)
        }
        this.loading = false
    }

    imageSrc(cartItem: CartItem) {
        return cartItem.product.images[0]?.getPathForSize(100, 100)
    }

    deleteItem(cartItem: CartItem) {
        CheckoutManager.cart.removeItem(cartItem)
        CheckoutManager.saveCart()
    }

    editCartItem(cartItem: CartItem ) {
        this.present(new ComponentWithProperties(CartItemView, { cartItem: cartItem.duplicate(Version), oldItem: cartItem }).setDisplayStyle("sheet"))
    }

    activated() {
        console.log("set cart url")
        this.$nextTick(() => {
            HistoryManager.setUrl(WebshopManager.webshop.getUrlSuffix()+"/cart")
        })
    }

    mounted() {
        try {
            this.cart.validate(WebshopManager.webshop)
        } catch (e) {
            console.error(e)
            this.errorBox = new ErrorBox(e)
        }
        CheckoutManager.saveCart()
    }

    countFor(cartItem: CartItem) {
        return CheckoutManager.cart.items.reduce((prev, item) => {
            if (item.product.id != cartItem.product.id) {
                return prev
            }
            return prev + item.amount
        }, 0)  - (cartItem.amount ?? 0)
    }

    maximumRemainingFor(cartItem: CartItem) {
        if (cartItem.product.remainingStock === null) {
            return null
        }

        return cartItem.product.remainingStock - this.countFor(cartItem)
    }
}
</script>

<style lang="scss">
@use "@stamhoofd/scss/base/variables.scss" as *;
@use "@stamhoofd/scss/base/text-styles.scss" as *;

.cart-view {
    .cart-item-row {
        h3 {
            padding-top: 5px;
            @extend .style-title-3;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }

        .description {
            @extend .style-description-small;
            padding-top: 5px;
            white-space: pre-wrap;
        }

        .price {
            font-size: 14px;
            line-height: 1.4;
            font-weight: 600;
            color: $color-primary;
        }

        footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        img {
            width: 70px;
            height: 70px;
            border-radius: $border-radius;

            @media (min-width: 340px) {
                width: 80px;
                height: 80px;
            }

            @media (min-width: 801px) {
                width: 100px;
                height: 100px;
            }
        }
    }
}

</style>
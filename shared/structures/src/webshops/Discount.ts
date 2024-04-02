import { ArrayDecoder, AutoEncoder, BooleanDecoder, EnumDecoder, IntegerDecoder, MapDecoder, StringDecoder, field } from "@simonbackx/simple-encoding";
import { CartItem } from "./Cart";
import { v4 as uuidv4 } from "uuid";
import { Checkout } from "./Checkout";
import { Webshop } from "./Webshop";
import { Formatter } from "@stamhoofd/utility";
import { OptionMenu, Option } from "./Product";

export enum OptionSelectionRequirement {
    Required = "Required",
    Optional = "Optional",
    Excluded = "Excluded"
}

export class OptionSelectionRequirementHelper {
    static getName(requirement: OptionSelectionRequirement): string {
        switch(requirement) {
            case OptionSelectionRequirement.Required: return "Enkel met";
            case OptionSelectionRequirement.Optional: return "Met of zonder";
            case OptionSelectionRequirement.Excluded: return "Enkel zonder";
        }
    }

}

export class ProductSelector extends AutoEncoder {
    @field({ decoder: StringDecoder })
    productId: string;

    /**
     * Empty array = doesn't matter
     * Array set = required one of the product prices from the list
     */
    @field({ decoder: new ArrayDecoder(StringDecoder) })
    productPriceIds: string[] = []

    /**
     * Options that are missing in the list get a default value
     * depending whether the option menu is multiple choice or not.
     * 
     * For multiple choice:
     * - new options are optional
     * 
     * For choose one:
     * - new options are exluded unless all options are optional
     */
    @field({ decoder: new MapDecoder(StringDecoder, new EnumDecoder(OptionSelectionRequirement)) })
    optionIds: Map<string, OptionSelectionRequirement> = new Map()

    getOptionRequirement(optionMenu: OptionMenu, option: Option): OptionSelectionRequirement  {
        let value = this.optionIds.get(option.id);
        if (!value) {
            if (optionMenu.multipleChoice) {
                return OptionSelectionRequirement.Optional;
            } else {
                for (const o of optionMenu.options) {
                    if (this.optionIds.get(o.id) ?? OptionSelectionRequirement.Optional !== OptionSelectionRequirement.Optional) {
                       return OptionSelectionRequirement.Excluded;
                    }
                }
                return OptionSelectionRequirement.Optional;
            }
        }
        return value;
    }

    doesMatch(cartItem: CartItem) {
        if (cartItem.product.id !== this.productId) {
            return false;
        }

        if (this.productPriceIds.includes(cartItem.productPrice.id)) {
            return false;
        }

        for (const option of cartItem.options) {
            let value = this.getOptionRequirement(option.optionMenu, option.option)

            if (value === OptionSelectionRequirement.Excluded) {
                return false;
            }
        }

        for (const [id, requirement] of this.optionIds) {
            if (requirement === OptionSelectionRequirement.Required) {
                const found = cartItem.options.find(o => o.option.id === id);
                if (!found) {
                    return false;
                }
            }
        }

        return true;
    }

    getName(webshop: Webshop, isAdmin = false): {name: string, footnote: string} {
        const product = webshop.products.find(p => p.id === this.productId);
        if (!product) {
            return {
                name: 'Onbekend artikel',
                footnote: ''
            }
        }

        const allPrices = product.filteredPrices({admin: isAdmin});
        const productPrices = allPrices.filter (p => this.productPriceIds.includes(p.id));
        let suffix = '';
        if (allPrices.length > 1 && this.productPriceIds.length && productPrices.length < allPrices.length) {
            suffix = productPrices.map(p => p.name).join(', ')
        }

        let footnote = '';

        const excludedOptions = product.optionMenus.flatMap(menu => {
            return menu.options.filter(o => this.getOptionRequirement(menu, o) === OptionSelectionRequirement.Excluded)
        });

        const requiredOptions = product.optionMenus.flatMap(menu => {
            return menu.options.filter(o => this.getOptionRequirement(menu, o) === OptionSelectionRequirement.Required)
        });
 
        if (excludedOptions.length && requiredOptions.length === 0) {
            footnote = 'Behalve voor keuzes met ' + Formatter.joinLast(excludedOptions.map(o => o.name), ', ', ' of ');
        } else if (excludedOptions.length === 0 && requiredOptions.length) {
            footnote = 'Enkel indien gekozen voor ' + Formatter.joinLast(requiredOptions.map(o => o.name), ', ', ' en ');
        } else if (excludedOptions.length && requiredOptions.length) {
            footnote = 'Enkel indien gekozen voor ' + Formatter.joinLast(requiredOptions.map(o => o.name), ', ', ' en ') + ' en niet gekozen voor ' + Formatter.joinLast(excludedOptions.map(o => o.name), ', ', ' of ');
        }

        return {
            name: product.name + (suffix ? (' (' + suffix + ')') : ''),
            footnote
        }
    }
}

export class DiscountRequirement extends AutoEncoder {
    @field({ decoder: StringDecoder, defaultValue: () => uuidv4() })
    id: string;
    
    @field({ decoder: ProductSelector })
    product: ProductSelector;

    /**
     * Minimum amount to trigger this requirement
     */
    @field({ decoder: IntegerDecoder })
    amount = 1

    /**
     * Requirements can match multiple times (for X + Y discount systems)
     */
    getMatchCount(checkout: Checkout) {
        if (this.amount === 0) {
            return 0;
        }

        let amount = 0;
        for (const item of checkout.cart.items) {
            if (this.product.doesMatch(item)) {
                amount += item.amount
            }
        }

        return Math.floor(amount / this.amount);
    }
}

export class GeneralDiscount extends AutoEncoder {
    /**
     * Fixed discount on order
     */
    @field({ decoder: IntegerDecoder })
    fixedDiscount = 0

    /**
     * Percentage discount on order, in pertenthousand 1 / 10 000
     * 10 = 0,1% discount
     * 1 = 0,01% discount
     */
    @field({ decoder: IntegerDecoder })
    percentageDiscount = 0

    @field({ decoder: BooleanDecoder })
    stackable = false

    multiply(amount: number): GeneralDiscount {
        return GeneralDiscount.create({
            fixedDiscount: Math.round(this.fixedDiscount * amount),
            percentageDiscount: this.percentageDiscount,
            stackable: this.stackable
        })
    }
}

export class ProductDiscount extends AutoEncoder {
    /**
     * Id determines uniqueness so should not be reused between discounts
     */
    @field({ decoder: StringDecoder, defaultValue: () => uuidv4() })
    id: string;

    @field({ decoder: IntegerDecoder })
    discountPerPiece = 0

    /**
     * Percentage discount on order, in pertenthousand 1 / 10 000
     * 10 = 0,1% discount
     * 1 = 0,01% discount
     */
    @field({ decoder: IntegerDecoder })
    percentageDiscount = 0

    calculate(price: number): number {
        price = Math.min(price, Math.max(0, Math.round(price * (10000 - this.percentageDiscount) / 10000))) // Min is required to support negative prices: prices should never increase after applyign discounts
        price = Math.min(price, Math.max(0, price - this.discountPerPiece)) // Min is required to support negative prices: prices should never increase after applyign discounts
        return price;
    }
}

export enum ProductDiscountRepeatBehaviour {
    Once = "Once",
    RepeatLast = "RepeatLast",
    RepeatPattern = "RepeatPattern"
}

export class ProductDiscountSettings extends AutoEncoder {
    @field({ decoder: StringDecoder, defaultValue: () => uuidv4() })
    id: string;
    
    @field({ decoder: ProductSelector })
    product: ProductSelector;

    @field({ decoder: new ArrayDecoder(ProductDiscount) })
    discounts = [ProductDiscount.create({})]

    @field({ decoder: new EnumDecoder(ProductDiscountRepeatBehaviour) })
    repeatBehaviour = ProductDiscountRepeatBehaviour.Once

    getApplicableDiscounts(offset: number, amount: number): ProductDiscount[] {
        let d = this.discounts.slice()
        if (this.repeatBehaviour === ProductDiscountRepeatBehaviour.RepeatLast) {
            while(d.length < offset + amount) {
                d.push(this.discounts[this.discounts.length - 1])
            }
        } else if (this.repeatBehaviour === ProductDiscountRepeatBehaviour.RepeatPattern) {
            while(d.length < offset + amount) {
                d.push(this.discounts[d.length % this.discounts.length])
            }
        }

        return d.slice(offset, offset + amount)
    }

    getTitle(webshop: Webshop, isAdmin = false): {title: string, description: string, footnote: string} {
        const n = this.product.getName(webshop, isAdmin)

        let titles: string[] = [n.name];
        let descriptions: string[] = [];
        let footnotes: string[] = [];

        if (n.footnote) {
            const index = '*'.repeat(footnotes.length + 1);
            titles.push(index)
            footnotes.push(index + ' ' + n.footnote)
        }

        // if (this.discount.percentageDiscount) {
        //    if (this.discount.percentageDiscount >= 100 * 100) {
        //        if (this.discount.amount === null) {
        //            descriptions.push("Gratis")
        //        } else {
        //            if (this.discount.amount === 1) {
        //                descriptions.push("Eén stuk gratis")
        //            } else {
        //                descriptions.push(this.discount.amount + " stuks gratis")
        //            }
        //        }
        //    } else {
        //        if (this.discount.amount === null) {
        //            descriptions.push(Formatter.percentage(this.discount.percentageDiscount) + " korting")
        //        } else {
        //            if (this.discount.amount === 1) {
        //                descriptions.push(
        //                    "Eén keer " + Formatter.percentage(this.discount.percentageDiscount) + " korting"
        //                )
        //            } else {
        //                descriptions.push(
        //                    Formatter.percentage(this.discount.percentageDiscount) + " korting" + " korting op eerste " + this.discount.amount + ' stuks'
        //                )
        //            }
        //        }
        //    }
        //    
        // }
        // if (this.discount.discountPerPiece) {
        //     if (this.discount.amount === null) {
        //         descriptions.push(Formatter.price(this.discount.discountPerPiece) + " korting per stuk")
        //     } else {
        //         if (this.discount.amount === 1) {
        //             descriptions.push(
        //                 "Eén keer " + Formatter.price(this.discount.discountPerPiece) + " korting"
        //             )
        //         } else {
        //             descriptions.push(
        //                 Formatter.price(this.discount.discountPerPiece) + " korting op eerste " + this.discount.amount + ' stuks'
        //             )
        //         }
        //     }
        // }

         if (descriptions.length === 0) {
            descriptions.push('Geen korting')
        }

        return {
            title: titles.join(' '),
            description: Formatter.joinLast(descriptions, ', ', ' en '),
            footnote: footnotes.join('\n')
        }
    }
}

export class ProductDiscountTracker {
    discount: ProductDiscountSettings
    usageCount = 0

    constructor(discount: ProductDiscountSettings) {
        this.discount = discount;
    }

    getNextDiscount(): ProductDiscount|null {
        const d = this.discount.getApplicableDiscounts(this.usageCount, 1);
        if (d.length === 1) {
            return d[0];
        }
        return null;
    }

    markUsed() {
        this.usageCount += 1;
    }
}

export class Discount extends AutoEncoder {
    @field({ decoder: StringDecoder, defaultValue: () => uuidv4() })
    id: string;

    /**
     * Empty list = no requirements
     */
     @field({ decoder: new ArrayDecoder(DiscountRequirement) })
    requirements: DiscountRequirement[] = []

    /**
     * If the requirements match x times, apply the discount x times
     */
    @field({ decoder: BooleanDecoder })
    applyMultipleTimes = false

    @field({ decoder: GeneralDiscount })
    orderDiscount = GeneralDiscount.create({})

    @field({ decoder: new ArrayDecoder(ProductDiscountSettings) })
    productDiscounts: ProductDiscountSettings[] = []

    getTitle(webshop: Webshop, isAdmin = false): {title: string, description: string, footnote: string} {
        let titles: string[] = [];
        let footnotes: string[] = [];
        let descriptions: string[] = [];

        if (this.orderDiscount.percentageDiscount) {
            titles.push(
                Formatter.percentage(this.orderDiscount.percentageDiscount) + " korting"
            )
        }
        if (this.orderDiscount.fixedDiscount) {
            titles.push(
                Formatter.price(this.orderDiscount.fixedDiscount) + " korting"
            )
        }

        // for (const productDiscount of this.productDiscounts) {
        //     if (productDiscount.discount.percentageDiscount) {
        //         const n = productDiscount.product.getName(webshop, isAdmin)
        //         titles.push(
        //             Formatter.percentage(productDiscount.discount.percentageDiscount) + " korting op " + n.name
        //         )
        //         if (n.footnote) {
        //             const index = '*'.repeat(footnotes.length + 1);
        //             titles.push(index)
        //             footnotes.push(index + ' ' + n.footnote)
        //         }
        //     }
        //     if (productDiscount.discount.discountPerPiece) {
        //         const n = productDiscount.product.getName(webshop, isAdmin)
        //         titles.push(
        //             Formatter.price(productDiscount.discount.discountPerPiece) + " korting per stuk op " + n.name
        //         )
        //         if (n.footnote) {
        //             const index = '*'.repeat(footnotes.length + 1);
        //             titles.push(index)
        //             footnotes.push(index + ' ' + n.footnote)
        //         }
        //     }
        // }

        if (titles.length === 0) {
            return {
                title: 'Geen korting',
                description: '',
                footnote: ''
            }
        }

        if (this.requirements.length) {
            if (this.applyMultipleTimes) {
                if (this.requirements.length > 1) {
                    descriptions.push('Per bestelde combinatie van')
                } else {
                    descriptions.push('Per besteld')
                }
            } else {
                descriptions.push('Bij bestellen van minstens')
            }

            const subdescriptions: string[] = [];

            for (const requirement of this.requirements) {
                const n = requirement.product.getName(webshop, isAdmin)
                subdescriptions.push(requirement.amount + ' x ' + n.name)

                if (n.footnote) {
                    const index = '*'.repeat(footnotes.length + 1);
                    subdescriptions[subdescriptions.length - 1] = subdescriptions[subdescriptions.length - 1]+index;
                    footnotes.push(index + ' ' + n.footnote)
                }
            }

            descriptions.push(Formatter.joinLast(subdescriptions, ', ', ' en '))
        }

        return {
            title: titles.join(' '),
            description: descriptions.join(' '),
            footnote: footnotes.join('\n')
        }
    }

    applyToCheckout(checkout: Checkout) {
        let matchCount: null|number = null;
        if (this.requirements.length > 0) {
            for (const requirement of this.requirements) {
                const amount = requirement.getMatchCount(checkout)

                if (amount === 0) {
                    // Not applicable
                    return;
                }

                matchCount = matchCount === null ? amount : Math.min(amount, matchCount)
            }
        }

        if (!this.applyMultipleTimes) {
            matchCount = 1;
        }

        // Fixed part to the whole order
        const multipliedOrderDiscount = this.orderDiscount.multiply(matchCount ?? 1)
        checkout.fixedDiscount += multipliedOrderDiscount.fixedDiscount
        checkout.percentageDiscount = Math.max(checkout.percentageDiscount , multipliedOrderDiscount.percentageDiscount)

        // Per product
        for (const discount of this.productDiscounts) {
            const tracker = new ProductDiscountTracker(discount);

            if (this.applyMultipleTimes) {
                // Repeating is not allowed if multiple times is enable
                tracker.discount = tracker.discount.clone()
                tracker.discount.repeatBehaviour = ProductDiscountRepeatBehaviour.Once
                tracker.discount.discounts = Array(matchCount).fill(0).flatMap(_ => tracker.discount.discounts)
            }

            for (const item of checkout.cart.items) {
                if (discount.product.doesMatch(item)) {
                    item.applicableDiscounts.push(tracker);
                }
            }
        }
    }
}
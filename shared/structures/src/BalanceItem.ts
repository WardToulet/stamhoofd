import { ArrayDecoder, AutoEncoder, DateDecoder, field, IntegerDecoder, StringDecoder } from "@simonbackx/simple-encoding";
import { v4 as uuidv4 } from "uuid";

import { Payment } from "./members/Payment";
import { Registration } from "./members/Registration";
import { RegistrationWithMember } from "./members/RegistrationWithMember";
import { Order } from "./webshops/Order";

export enum BalanceItemStatus {
    /**
     * The balance is not yet owed by the member (payment is optional and not visible). But it is paid, the status will change to 'paid'.
     */
    Hidden = "Hidden",

    /**
     * The balance is owed by the member, but not yet (fully) paid by the member.
     */
    Pending = "Pending",

    /**
     * The balance has been paid by the member. All settled.
     */
    Paid = "Paid"
}

export class BalanceItem extends AutoEncoder {
    @field({ decoder: StringDecoder, defaultValue: () => uuidv4() })
    id: string

    @field({ decoder: StringDecoder })
    description = ""

    @field({ decoder: IntegerDecoder })
    price = 0

    @field({ decoder: IntegerDecoder })
    pricePaid = 0

    @field({ decoder: DateDecoder })
    createdAt = new Date()
}

export class BalanceItemPayment extends AutoEncoder {
    @field({ decoder: StringDecoder, defaultValue: () => uuidv4() })
    id: string

    @field({ decoder: IntegerDecoder })
    price: number
}

export class BalanceItemDetailed extends BalanceItem {
    @field({ decoder: RegistrationWithMember, nullable: true })
    registration: RegistrationWithMember | null = null

    @field({ decoder: Order, nullable: true })
    order: Order | null = null
}

export class BalanceItemPaymentDetailed extends BalanceItemPayment {
    @field({ decoder: BalanceItemDetailed })
    balanceItem: BalanceItemDetailed
}

//
export class MemberBalanceItemPayment extends BalanceItemPayment {
    @field({ decoder: Payment })
    payment: Payment
}

export class MemberBalanceItem extends BalanceItem {
    @field({ decoder: new ArrayDecoder(MemberBalanceItemPayment) })
    payments: MemberBalanceItemPayment[] = []

    @field({ decoder: StringDecoder, nullable: true })
    memberId: string | null = null

    @field({ decoder: StringDecoder, nullable: true })
    userId: string | null = null

    @field({ decoder: StringDecoder, nullable: true })
    registrationId: string | null = null

    @field({ decoder: StringDecoder, nullable: true })
    orderId: string | null = null
}
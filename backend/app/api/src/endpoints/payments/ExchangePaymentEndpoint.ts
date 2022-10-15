import { createMollieClient } from '@mollie/api-client';
import { AutoEncoder, BooleanDecoder, Decoder, field } from '@simonbackx/simple-encoding';
import { DecodedRequest, Endpoint, Request, Response } from "@simonbackx/simple-endpoints";
import { SimpleError } from "@simonbackx/simple-errors";
import { BalanceItemPayment, MolliePayment, MollieToken, Order, Organization, PayconiqPayment, Payment, STPendingInvoice } from '@stamhoofd/models';
import { QueueHandler } from '@stamhoofd/queues';
import { Payment as PaymentStruct, PaymentMethod, PaymentMethodHelper, PaymentProvider, PaymentStatus, STInvoiceItem } from "@stamhoofd/structures";

import { BuckarooHelper } from '../../helpers/BuckarooHelper';

type Params = {id: string};
class Query extends AutoEncoder {
    @field({ decoder: BooleanDecoder, optional: true })
    exchange = false
}
type Body = undefined
type ResponseBody = PaymentStruct | undefined;

/**
 * One endpoint to create, patch and delete groups. Usefull because on organization setup, we need to create multiple groups at once. Also, sometimes we need to link values and update multiple groups at once
 */

export class ExchangePaymentEndpoint extends Endpoint<Params, Query, Body, ResponseBody> {
    queryDecoder = Query as Decoder<Query>

    protected doesMatch(request: Request): [true, Params] | [false] {
        if (request.method != "POST") {
            return [false];
        }

        const params = Endpoint.parseParameters(request.url, "/payments/@id", {id: String});

        if (params) {
            return [true, params as Params];
        }
        return [false];
    }

    async handle(request: DecodedRequest<Params, Query, Body>) {
        const organization = await Organization.fromApiHost(request.host);
        
        // Not method on payment because circular references (not supprted in ts)
        const payment = await ExchangePaymentEndpoint.pollStatus(request.params.id, organization)
        if (!payment) {
            throw new SimpleError({
                code: "",
                message: "Deze link is ongeldig"
            })
        }

        if (request.query.exchange) {
            return new Response(undefined);
        }
        
        return new Response( 
            PaymentStruct.create({
                id: payment.id,
                method: payment.method,
                provider: payment.provider,
                status: payment.status,
                price: payment.price,
                transferDescription: payment.transferDescription,
                paidAt: payment.paidAt,
                createdAt: payment.createdAt,
                updatedAt: payment.updatedAt
            })
        );
    }

    static async handlePaymentStatusUpdate(payment: Payment, organization: Organization, status: PaymentStatus) {
        if (payment.status === status) {
            return;
        }
        const wasPaid = payment.paidAt !== null
        if (status === PaymentStatus.Succeeded) {
            payment.status = PaymentStatus.Succeeded
            payment.paidAt = new Date()
            await payment.save();

            // Prevent concurrency issues
            await QueueHandler.schedule("balance-item-update/"+organization.id, async () => {
                const balanceItemPayments = await BalanceItemPayment.balanceItem.load(
                    (await BalanceItemPayment.where({paymentId: payment.id})).map(r => r.setRelation(BalanceItemPayment.payment, payment))
                );

                for (const balanceItemPayment of balanceItemPayments) {
                    await balanceItemPayment.markPaid(organization);
                }
            })

            if (!wasPaid && payment.provider === PaymentProvider.Buckaroo && payment.method) {
                // Charge transaction fees
                const transactionFee = 25
                const name = "Transactiekosten voor "+PaymentMethodHelper.getName(payment.method)
                const item = STInvoiceItem.create({
                    name,
                    description: "Via Buckaroo",
                    amount: 1,
                    unitPrice: transactionFee,
                    canUseCredits: false
                })
                console.log("Scheduling transaction fee charge for ", payment.id, item)
                await QueueHandler.schedule("billing/invoices-"+organization.id, async () => {
                    await STPendingInvoice.addItems(organization, [item])
                });
            }
            return;
        }

        if (payment.status === PaymentStatus.Succeeded) {
            // No longer succeeded
            await QueueHandler.schedule("balance-item-update/"+organization.id, async () => {
                const balanceItemPayments = await BalanceItemPayment.balanceItem.load(
                    (await BalanceItemPayment.where({paymentId: payment.id})).map(r => r.setRelation(BalanceItemPayment.payment, payment))
                );

                for (const balanceItemPayment of balanceItemPayments) {
                    await balanceItemPayment.undoPaid(organization);
                }
            })
        }
        
        if (status == PaymentStatus.Failed) {
            await QueueHandler.schedule("balance-item-update/"+organization.id, async () => {
                const balanceItemPayments = await BalanceItemPayment.balanceItem.load(
                    (await BalanceItemPayment.where({paymentId: payment.id})).map(r => r.setRelation(BalanceItemPayment.payment, payment))
                );

                for (const balanceItemPayment of balanceItemPayments) {
                    await balanceItemPayment.markFailed(organization);
                }
            })
        }

        payment.status = status
        payment.paidAt = null
        await payment.save();
    }

    /**
     * ID of payment is needed because of race conditions (need to fetch payment in a race condition save queue)
     */
    static async pollStatus(paymentId: string, organization: Organization): Promise<Payment | undefined> {
        // Prevent polling the same payment multiple times at the same time: create a queue to prevent races
        return await QueueHandler.schedule("payments/"+paymentId, async () => {
            // Get a new copy of the payment (is required to prevent concurreny bugs)
            const payment = await Payment.getByID(paymentId)
            if (!payment) {
                return
            }

            if (payment.status == PaymentStatus.Pending || payment.status == PaymentStatus.Created || (payment.provider === PaymentProvider.Buckaroo && payment.status == PaymentStatus.Failed)) {
                
                if (payment.provider === PaymentProvider.Mollie) {
                    // check status via mollie
                    const molliePayments = await MolliePayment.where({ paymentId: payment.id}, { limit: 1 })
                    if (molliePayments.length == 1) {
                        const molliePayment = molliePayments[0]
                        // check status
                        const token = await MollieToken.getTokenFor(organization.id)
                        
                        if (token) {
                            try {
                                const mollieClient = createMollieClient({ accessToken: await token.getAccessToken() });
                                const mollieData = await mollieClient.payments.get(molliePayment.mollieId, {
                                    testmode: organization.privateMeta.useTestPayments ?? STAMHOOFD.environment != 'production',
                                })

                                console.log(mollieData) // log to log files to check issues

                                const details = (mollieData.details as any) 
                                if (details?.consumerName) {
                                    payment.ibanName = details.consumerName
                                }
                                if (details?.consumerAccount) {
                                    payment.iban = details.consumerAccount
                                }
                                if (details?.cardHolder) {
                                    payment.ibanName = details.cardHolder
                                }
                                if (details?.cardNumber) {
                                    payment.iban = "xxxx xxxx xxxx "+details.cardNumber
                                }

                                if (mollieData.status == "paid") {
                                    await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Succeeded)
                                } else if (mollieData.status == "failed" || mollieData.status == "expired" || mollieData.status == "canceled") {
                                    await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Failed)
                                } else if (this.isManualExpired(payment.status, payment)) {
                                    // Mollie still returning pending after 1 day: mark as failed
                                    console.error('Manually marking Mollie payment as expired', payment.id)
                                    await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Failed)
                                }
                            } catch (e) {
                                console.error('Payment check failed Mollie', payment.id, e);
                                if (this.isManualExpired(payment.status, payment)) {
                                    console.error('Manually marking Mollie payment as expired', payment.id)
                                    await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Failed)
                                }
                            }
                        } else {
                            console.warn("Mollie payment is missing for organization "+organization.id+" while checking payment status...")

                            if (this.isManualExpired(payment.status, payment)) {
                                console.error('Manually marking payment without mollie token as expired', payment.id)
                                await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Failed)
                            }
                        }
                    } else {
                        if (this.isManualExpired(payment.status, payment)) {
                            console.error('Manually marking payment without mollie payments as expired', payment.id)
                            await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Failed)
                        }
                    }
                } else if (payment.provider == PaymentProvider.Buckaroo) {
                    const helper = new BuckarooHelper(organization.privateMeta.buckarooSettings?.key ?? "", organization.privateMeta.buckarooSettings?.secret ?? "", organization.privateMeta.useTestPayments ?? STAMHOOFD.environment != 'production')
                    try {
                        let status = await helper.getStatus(payment)

                        if (this.isManualExpired(status, payment)) {
                            console.error('Manually marking Buckaroo payment as expired', payment.id)
                            status = PaymentStatus.Failed
                        }

                        await this.handlePaymentStatusUpdate(payment, organization, status)
                    } catch (e) {
                        console.error('Payment check failed Buckaroo', payment.id, e);
                        if (this.isManualExpired(payment.status, payment)) {
                            console.error('Manually marking Buckaroo payment as expired', payment.id)
                            await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Failed)
                        }
                    }
                   
                } else if (payment.provider == PaymentProvider.Payconiq) {
                    // Check status

                    const payconiqPayments = await PayconiqPayment.where({ paymentId: payment.id}, { limit: 1 })
                    if (payconiqPayments.length == 1) {
                        const payconiqPayment = payconiqPayments[0]

                        let status = await payconiqPayment.getStatus(organization)

                        if (this.isManualExpired(status, payment)) {
                            console.error('Manually marking Payconiq payment as expired', payment.id)
                            status = PaymentStatus.Failed
                        }

                        await this.handlePaymentStatusUpdate(payment, organization, status)
                        
                    } else {
                        console.warn("Payconiq payment is missing for organization "+organization.id+" while checking payment status...")

                        if (this.isManualExpired(payment.status, payment)) {
                            console.error('Manually marking Payconiq payment as expired because not found', payment.id)
                            await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Failed)
                        }
                    }
                } else {
                    console.error('Invalid payment provider', payment.provider, 'for payment', payment.id);
                    if (this.isManualExpired(payment.status, payment)) {
                        console.error('Manually marking unknown payment as expired', payment.id)
                        await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Failed)
                    }
                }
            }
            return payment
        })
    }

    static isManualExpired(status: PaymentStatus, payment: Payment) {
        if ((status == PaymentStatus.Pending || status === PaymentStatus.Created) && payment.method !== PaymentMethod.DirectDebit) {
            // If payment is not succeeded after one day, mark as failed
            if (payment.createdAt < new Date(new Date().getTime() - 60*1000*60*24)) {
                return true;
            }
        }
        return false;
    }
}

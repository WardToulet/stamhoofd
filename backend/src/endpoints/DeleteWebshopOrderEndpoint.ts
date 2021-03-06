import { DecodedRequest, Endpoint, Request, Response } from "@simonbackx/simple-endpoints";
import { SimpleError } from "@simonbackx/simple-errors";

import { Order } from '../models/Order';
import { Token } from '../models/Token';
import { Webshop } from '../models/Webshop';

type Params = { id: string; orderId: string };
type Query = undefined;
type Body = undefined
type ResponseBody = undefined

export class PatchWebshopOrdersEndpoint extends Endpoint<Params, Query, Body, ResponseBody> {
    protected doesMatch(request: Request): [true, Params] | [false] {
        if (request.method != "DELETE") {
            return [false];
        }

        const params = Endpoint.parseParameters(request.url, "/webshop/@id/orders/@orderId", { id: String, orderId: String });

        if (params) {
            return [true, params as Params];
        }
        return [false];
    }

    async handle(request: DecodedRequest<Params, Query, Body>) {
        const token = await Token.authenticate(request);

        const webshop = await Webshop.getByID(request.params.id)
        if (!webshop || token.user.organizationId != webshop.organizationId) {
            throw new SimpleError({
                code: "not_found",
                message: "Webshop not found",
                human: "Deze webshop bestaat niet (meer)"
            })
        }

        if (!token.user.permissions || !token.user.permissions.hasFullAccess()) {
            throw new SimpleError({
                code: "permission_denied",
                message: "No permissions for this webshop",
                human: "Je hebt geen toegang tot de bestellingen van deze webshop"
            })
        }
        
        const order = await Order.getByID(request.params.orderId)

        if (!order || order.webshopId != webshop.id) {
            throw new SimpleError({
                code: "order_not_found",
                message: "No order found",
                human: "De bestelling die je wilt verwijderen bestaat niet (meer)"
            })
        }

        await order.delete()      
        return new Response(undefined);
    }
}

import { DecodedRequest, Endpoint, Request, Response } from '@simonbackx/simple-endpoints';
import { Organization, RegisterCode, STCredit, UsedRegisterCode } from '@stamhoofd/models';
import { RegisterCodeStatus, UsedRegisterCode as UsedRegisterCodeStruct } from '@stamhoofd/structures';

import { Context } from '../../../../helpers/Context';

type Params = Record<string, never>;
type Query = undefined;
type Body = undefined;
type ResponseBody = RegisterCodeStatus;

export class GetRegisterCodeEndpoint extends Endpoint<Params, Query, Body, ResponseBody> {

    protected doesMatch(request: Request): [true, Params] | [false] {
        if (request.method != "GET") {
            return [false];
        }

        const params = Endpoint.parseParameters(request.url, "/register-code", {});

        if (params) {
            return [true, params as Params];
        }
        return [false];
    }

    async handle(_: DecodedRequest<Params, Query, Body>) {
        const organization = await Context.setOrganizationScope();
        await Context.authenticate()

        if (!await Context.auth.hasSomeAccess(organization.id)) {
            throw Context.auth.error()
        }

        const codes = await RegisterCode.where({ organizationId: organization.id })
        let code = codes[0]

        if (codes.length == 0) {
            code = new RegisterCode()
            code.organizationId = organization.id
            code.description = "Doorverwezen door "+ organization.name
            code.value = 2500
            await code.generateCode()
            await code.save()
        }

        const usedCodes = await UsedRegisterCode.getAll(code.code)
        const allOrganizations = await Organization.getByIDs(...usedCodes.flatMap(u => u.organizationId ? [u.organizationId] : []))
        const allCredits = await STCredit.getByIDs(...usedCodes.flatMap(u => u.creditId ? [u.creditId] : []))

        return new Response(RegisterCodeStatus.create({
            code: code.code,
            value: code.value,
            invoiceValue: code.invoiceValue,
            usedCodes: usedCodes.map(c => {
                return UsedRegisterCodeStruct.create({ 
                    id: c.id,
                    organizationName: allOrganizations.find(o => o.id === c.organizationId)?.name ?? "Onbekend",
                    createdAt: c.createdAt,
                    creditValue: (c.creditId ? allCredits.find(credit => credit.id === c.creditId)?.change : null) ?? null
                })
            })
        }))
    }
}

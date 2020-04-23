import { OrganizationFactory } from '@stamhoofd-backend/app/src/organizations/factories/OrganizationFactory';
import { Request } from '@stamhoofd-backend/routing';

import { MemberFactory } from '../factories/MemberFactory';
import { GetMember } from "./GetMember";

// Test endpoint
const getMemberEndpoint = new GetMember()

test('Get data of member 67', async () => {
    const organization = await new OrganizationFactory({}).create()
    const member = await new MemberFactory({ organization: organization }).create()
    const r = Request.buildJson("GET", "/members/" + member.id, organization.getApiHost());

    if (!member.id) {
        throw new Error("Compiler doesn't optimize for this, but this should not be able to run")
    }

    const response = await getMemberEndpoint.getResponse(r, { id: member.id });
    expect(response.body).toEqual({ organizationId: organization.id, encrypted: member.encrypted });
});
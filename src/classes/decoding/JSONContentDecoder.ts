import { ContentDecoder } from './ContentDecoder';
import { Data } from './Data';
import { ObjectData } from './ObjectData';

export class JSONContentDecoder<T> implements ContentDecoder<any, T> {
    decoders: ContentDecoder<Data, T>[]
    constructor(...decoders: ContentDecoder<Data, T>[]) {
        this.decoders = decoders
    }

    getContentTypes(): string[] {
        return this.decoders.flatMap(el => el.getContentTypes());
    }

    decodeContent(contentType: string, data: any): T {
        const decoder = this.decoders.find((decoder) => {
            return decoder.getContentTypes().includes(contentType)
        });
        if (!decoder) {
            throw new Error("Could not decode JSON to contentType " + contentType);
        }

        // todo: implement
        var d = new ObjectData(JSON.parse(data));
        return decoder.decodeContent(contentType, d)
    }
}
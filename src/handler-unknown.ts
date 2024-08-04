import { HandlerInterface } from './handler';
import { Env, CacheParams, MIMEPair } from './types';


export default class UnknownHandler implements HandlerInterface {

    public constructor(request: Request, env: Env) {

    }

    public async getCacheParams(): Promise<CacheParams> {
        return {};
    }

    public async handle(): Promise<Uint8Array> {
        return new Uint8Array();
    }

    public getMIME(): MIMEPair {
        return {ext: 'png', 'mime': 'image/png'}
    }
}
// Todo

import { FetcherInterface } from './fetcher.ts';
import { Env, CacheParams, MIMEPair } from './types.ts';


export default class URLFetcher implements FetcherInterface {
    
    public constructor(request: Request, env: Env) {

    }

    public async getCacheParams(): Promise<CacheParams> {
        return {};
    }

    public async fetch(): Promise<[Request, Response]> {
        return [new Request(''), new Response()];
    }

    public getMIME(): MIMEPair {
        return {ext: 'png', 'mime': 'image/png'}
    }

}
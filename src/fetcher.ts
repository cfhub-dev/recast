import { Env, CacheParams, MIMEPair } from './types';

export interface FetcherInterface {
    getCacheParams(): Promise<CacheParams>;
    fetch():  Promise<[Request, Response]>;
    getMIME(): MIMEPair;
}
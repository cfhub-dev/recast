import { Env } from './types.ts';
import { FetcherInterface } from './fetcher';
import { HandlerInterface } from './handler';
import S3Fetcher from './fetcher-s3';
import URLFetcher from './fetcher-url';
import ImageHandler from './handler-image';
import UnknownHandler from './handler-unknown';
import { getMime } from './tools.ts';


export default class Dispatcher {
    private request: Request;
    private env: Env;
    private fetcher: FetcherInterface;
    private handler: HandlerInterface;

    public constructor(request: Request, env: Env) {
        this.request = request;
        this.env = env;

        const url = new URL(this.request.url);
        let pathname = url.pathname;
        let path = decodeURI(url.pathname);
        try {
            // Todo
            const pathObj = new URL(path);
            this.fetcher = new URLFetcher(this.request, this.env);
            pathname = pathObj.pathname;
        } catch {
            this.fetcher = new S3Fetcher(this.request, this.env);
        }
        const mime = getMime(pathname);
        if (mime?.substring(0, 6) == 'image/')
            this.handler = new ImageHandler(this.request, this.env);
        else
            this.handler = new UnknownHandler(this.request, this.env);
    }

    public getFetcher(): FetcherInterface {
        return this.fetcher;
    }

    public getHandler(): HandlerInterface {
        return this.handler;
    }

    public async geCacheURL(): Promise<string> {
        const fetcherParams = await this.fetcher.getCacheParams();
        const handlerParams = await this.handler.getCacheParams();
        let combinedParams = {...fetcherParams, ...handlerParams};
        const sortedKeys = Object.keys(combinedParams).sort();
        const query: string[] = [];
        for (const key of sortedKeys) {
            query.push(`${key}=${encodeURIComponent(combinedParams[key])}`);
        }
        const queryString = query.join('&');
        const url = new URL(this.request.url);
        url.search = queryString;
        return url.toString();
    }
    
}

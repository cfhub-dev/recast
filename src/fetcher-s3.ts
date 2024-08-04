/**
 * This code is aim to fetch object from s3 and s3 compatible service
 * Source code based on https://github.com/backblaze-b2-samples/cloudflare-b2
 * Original author is Ashley Williams <ashley666ashley@gmail.com>
 */
import { AwsClient } from 'aws4fetch';

import { FetcherInterface } from './fetcher.ts';
import { Env, CacheParams, MIMEPair } from './types.ts';


export default class S3Fetcher implements FetcherInterface {

    private request: Request;
    private env: Env;

    private rangeEntryAttempts = 3;

    private unsignableHeaders: string[] = [
        // These headers appear in the request, but are not passed upstream
        'x-forwarded-proto',
        'x-real-ip',
        // We can't include accept-encoding in the signature because Cloudflare
        // sets the incoming accept-encoding header to "gzip, br", then modifies
        // the outgoing request to set accept-encoding to "gzip".
        'accept-encoding',
    ];

    public constructor(request: Request, env: Env) {
        this.request = request;
        this.env = env;
    }

    public async getCacheParams(): Promise<CacheParams> {
        return {};
    }

    public async fetch(): Promise<[Request, Response]> {
        const url = new URL(this.request.url);
        // Incoming protocol and port is taken from the worker's environment.
        // Local dev mode uses plain http on 8787, and it's possible to deploy
        // a worker on plain http. B2 only supports https on 443
        url.protocol = 'https';
        url.port = '443';

        const params = new URLSearchParams(url.search);

        // Remove leading and trailing slashes from path
        let path = url.pathname.substring(1, url.pathname.length);
        if (path.endsWith('/'))
            path = path.substring(0, path.length - 1);
        // Split the path into segments
        const pathSegments = path.split('/');

        if (this.env['ALLOW_LIST_BUCKET'] !== 'true') {
            // Don't allow list bucket requests
            if ((this.env['BUCKET_NAME'] === '$path' && pathSegments.length < 2) ||
                (this.env['BUCKET_NAME'] !== '$path' && path.length === 0)) {
                return [this.request, new Response(null, {
                    status: 404,
                    statusText: 'Not Found'
                })];
            }
        }

        // Set upstream target hostname.
        switch (this.env['BUCKET_NAME']) {
            case '$path':
                // Bucket name is initial segment of URL path
                url.hostname = this.env['B2_ENDPOINT'];
                break;
            case '$host':
                // Bucket name is initial subdomain of the incoming hostname
                url.hostname = url.hostname.split('.')[0] + '.' + this.env['B2_ENDPOINT'];
                break;
            default:
                url.hostname = this.env['BUCKET_NAME'] + '.' + this.env['B2_ENDPOINT'];
                break;
        }

        // Certain headers, such as x-real-ip, appear in the incoming request but
        // are removed from the outgoing request. If they are in the outgoing
        // signed headers, B2 can't validate the signature.
        const headers = this.filterHeaders(this.request.headers);

        // Create an S3 API client that can sign the outgoing request
        const client = new AwsClient({
            accessKeyId: this.env['B2_APPLICATION_KEY_ID'],
            secretAccessKey: this.env['B2_APPLICATION_KEY'],
            service: 's3',
        });

        // Save the request method, so we can process responses for HEAD requests appropriately
        const requestMethod = this.request.method;

        // Sign the outgoing request
        //
        // For HEAD requests Cloudflare appears to change the method on the outgoing request to GET (#18), which
        // breaks the signature, resulting in a 403. So, change all HEADs to GETs. This is not too inefficient,
        // since we won't read the body of the response if the original request was a HEAD.
        const signedRequest = await client.sign(url.toString(), {
            method: 'GET',
            headers: headers
        });

        // For large files, Cloudflare will return the entire file, rather than the requested range
        // So, if there is a range header in the request, check that the response contains the
        // content-range header. If not, abort the request and try again.
        // See https://community.cloudflare.com/t/cloudflare-worker-fetch-ignores-byte-request-range-on-initial-request/395047/4
        if (signedRequest.headers.has('range')) {
            let attempts = this.rangeEntryAttempts;
            let response: Response;
            do {
                let controller = new AbortController();
                response = await fetch(signedRequest.url, {
                    method: signedRequest.method,
                    headers: signedRequest.headers,
                    signal: controller.signal,
                });
                if (response.headers.has('content-range')) {
                    // Only log if it didn't work first time
                    if (attempts < this.rangeEntryAttempts) {
                        console.log(`Retry for ${signedRequest.url} succeeded - response has content-range header`);
                    }
                    // Break out of loop and return the response
                    break;
                } else if (response.ok) {
                    attempts -= 1;
                    console.error(`Range header in request for ${signedRequest.url} but no content-range header in response. Will retry ${attempts} more times`);
                    if (attempts > 0) {
                        controller.abort();
                    }
                } else {
                    // Response is not ok, so don't retry
                    break;
                }
            } while (attempts > 0);

            if (attempts <= 0) {
                console.error(`Tried range request for ${signedRequest.url} ${this.rangeEntryAttempts} times, but no content-range in response.`);
            }

            // Return whatever response we have rather than an error response
            // This response cannot be aborted, otherwise it will raise an exception
            return [signedRequest, response]!;
        }

        // Send the signed request to B2
        const s3Response = await fetch(signedRequest);
        return [signedRequest, s3Response];
    }

    public getMIME(): MIMEPair {
        return {ext: 'png', 'mime': 'image/png'}
    }

    // Filter out cf-* and any other headers we don't want to include in the signature
    private filterHeaders(headers: Headers): Headers {
        return new Headers(Array.from(headers.entries())
            .filter(([key]) =>
                !this.unsignableHeaders.includes(key) &&
                !key.startsWith('cf-') &&
                !(this.env['ALLOWED_HEADERS'] && !this.env['ALLOWED_HEADERS'].includes(key))
            ));
    }

    private filterParams() {
        const url = new URL(this.request.url);
        const params = new URLSearchParams(url.search);
    }

}

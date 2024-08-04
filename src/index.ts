/**
 * @author Peng Hou <houpengg@outlook.com>
 * @date 2024-08-01
 * @license MIT
 * Copyright (c) 2024 Peng Hou <houpengg@outlook.com>
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { Env } from './types';
import Dispatcher from './dispatcher';


// Cache Storage instance for Cloudflare Workers
const cache = (caches as any).default;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (!['GET', 'HEAD'].includes(request.method)) {
            return new Response(null, {
                status: 405,
                statusText: "Method Not Allowed"
            });
        }

        const dispatcher = new Dispatcher(request, env);

        const cacheRequest = new Request(await dispatcher.geCacheURL(), request);
        const lastResponse: Response = await cache.match(cacheRequest);
        if (lastResponse) {
            return lastResponse;
        }
        
        const fetcher = dispatcher.getFetcher()
        const [fetcherRequest, fetcherResponse] = await fetcher.fetch();

        if (fetcherResponse.status == 304) {
            return new Response(null, {
                headers: fetcherResponse.headers,
                status: fetcherResponse.status,
                statusText: fetcherResponse.statusText
            });
        }

        const requestMethod = request.method;
        if (requestMethod === 'HEAD') {
            // Original request was HEAD, so return a new Response without a body
            return new Response(null, {
                headers: fetcherResponse.headers,
                status: fetcherResponse.status,
                statusText: fetcherResponse.statusText
            });
        }

        const handler = dispatcher.getHandler()
        const handlerResponse = await handler.handle(fetcherRequest, fetcherResponse);

        // 设置 Content-Type
        const newHeaders = new Headers(fetcherResponse.headers);
        newHeaders.set('Content-Type', handler.getMIME().mime);
        newHeaders.set('Cache-Control', 'public, max-age=2592000');

        let response = new Response(handlerResponse, {
            status: fetcherResponse.status,
            statusText: fetcherResponse.statusText,
            headers: newHeaders
        });

        // 将处理过的响应放入缓存
        await cache.put(cacheRequest, response.clone());

        // 返回新的响应
        return response;
    }
};

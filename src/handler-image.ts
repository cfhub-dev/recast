import { PhotonImage, resize, SamplingFilter, crop } from '@cf-wasm/photon';

import { HandlerInterface } from './handler';
import { Env, ImageParams, CacheParams, MIMEPair } from './types';


export default class ImageHandler implements HandlerInterface {

    private request: Request;
    private env: Env;

    imageParamsFilter = {
        // 'p': null, // preset
        'w': this.filterSize, // width
        'h': this.filterSize, // height
        // 'ic': null, // is crop default 1
        // 'iz': null, // is zoom in default 0
        // 'q': null, // quality 0-100
        // 'b': null, // brightness 0-100
        // 'hu': null, // hue 0-100
        // 'c': null, // contrast 0-100
        // 's': null, // sharpening 0-100
        // 'f': null, // flipping
        // 'o': null, // output format jpg/png/webp
    }

    public constructor(request: Request, env: Env) {
        this.request = request;
        this.env = env;
    }

    public async getCacheParams(): Promise<CacheParams> {
        const url = new URL(this.request.url);
        const params = new URLSearchParams(url.search);

        const imageParams: ImageParams = {};
        for (const [name, value] of params) {
            if (!(name in this.imageParamsFilter)) continue;
            let paramValue = await this.imageParamsFilter[name](value);
            if (typeof paramValue === 'string')
                imageParams[name] = paramValue;
            else if (typeof paramValue === 'number')
                imageParams[name] = paramValue.toString();
        }
        return imageParams;
    }

    public async handle(fetcherRequest: Request, fetcherResponse: Response): Promise<Uint8Array> {

        const url = new URL(this.request.url);
        const params = new URLSearchParams(url.search);

        const imageParams: ImageParams = {};
        for (const [name, value] of params) {
            if (!(name in this.imageParamsFilter)) continue;
            imageParams[name] = await this.imageParamsFilter[name](value);
        }

        let image = await this.streamToUint8Array(fetcherResponse.body as ReadableStream<Uint8Array>);
        if (Object.keys(imageParams).length > 0) {
            let photonObj = PhotonImage.new_from_byteslice(image);

            // resize
            if ('w' in imageParams || 'h' in imageParams) {
                // Width and height ratio
                const rawWidth = photonObj.get_width();
                const rawHeight = photonObj.get_height();
                const rawRatio = this.round(rawWidth / rawHeight, 2);

                let resizeWidth = rawWidth;
                let resizeHeight = rawHeight;
                let resizeRatio = rawRatio;

                if ('w' in imageParams && 'h' in imageParams) {
                    // If width and height all exist, calculate the difference between
                    // user input width and height ratio and the original ratio,
                    // then resize to redundant size, prepare to crop lately
                    resizeRatio = this.round(imageParams['w'] / imageParams['h'], 2);
                    if (rawRatio > resizeRatio) {
                        // If it only has width, calculate height with the width and ratio
                        resizeHeight = imageParams['h'];
                        resizeWidth = Math.round(resizeHeight * rawRatio);
                    } else if (rawRatio < resizeRatio) {
                        // If it only has height, calculate width with the height and ratio
                        resizeWidth = imageParams['w'];
                        resizeHeight = Math.round(resizeWidth / rawRatio);
                    }
                } else if ('w' in imageParams && !('h' in imageParams)) {
                    resizeWidth = imageParams['w'];
                    imageParams['h'] = resizeHeight = Math.round(imageParams['w'] / rawRatio);
                } else if (!('w' in imageParams) && 'h' in imageParams) {
                    resizeHeight = imageParams['h'];
                    imageParams['w'] = resizeWidth = Math.round(imageParams['h'] * rawRatio);
                }

                photonObj = resize(photonObj, resizeWidth, resizeHeight, SamplingFilter.Nearest);

                if (rawRatio != resizeRatio) {
                    // Need crop
                    let cropX1 = 0, cropY1 = 0, cropX2 = 0, cropY2 = 0;
                    if (rawRatio > resizeRatio) {
                        cropX1 = Math.round((resizeWidth - imageParams['w']) / 2);
                        cropY1 = 0;
                        cropX2 = resizeWidth - cropX1;
                        cropY2 = resizeHeight;
                    } else {
                        cropX1 = 0;
                        cropY1 = Math.round((resizeHeight - imageParams['h']) / 2);
                        cropX2 = resizeWidth;
                        cropY2 = resizeHeight - cropY1;
                    }
                    photonObj = crop(photonObj, cropX1, cropY1, cropX2, cropY2);
                }
            }
            image = photonObj.get_bytes();

        }
        return image;
    }

    public getMIME(): MIMEPair {
        return {ext: 'png', 'mime': 'image/png'}
    }

    private async streamToUint8Array(readableStream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
        const reader = readableStream.getReader();
        const chunks: Uint8Array[] = [];
        let done: boolean | undefined;
        let value: Uint8Array | undefined;

        while ({ done, value } = await reader.read(), !done) {
            chunks.push(value!);
        }

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const arrayBuffer = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
            arrayBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        return arrayBuffer;
    }

    private async filterSize(value: string): Promise<number> {
        let parsedValue = parseInt(value, 10);
        parsedValue = Math.min(parsedValue, 6000);
        parsedValue = Math.max(parsedValue, 10);
        return parsedValue;
    }

    private async filterPreset(value: string): Promise<string> {
        return value;
    }

    private round(num: number, decimals: number): number {
        const factor = Math.pow(10, decimals);
        return Math.round(num * factor) / factor;
    }
}
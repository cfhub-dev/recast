import { ExtToMIME } from "./settings";


export function getMime(filename: string): string | null {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension)
        return null;
    if (extension in ExtToMIME)
        return ExtToMIME[extension];
    return null;
}
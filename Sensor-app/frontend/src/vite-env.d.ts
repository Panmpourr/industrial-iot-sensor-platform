/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Backend base URL, e.g. http://localhost:5000 (baked into the bundle at build time). */
    readonly VITE_API_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

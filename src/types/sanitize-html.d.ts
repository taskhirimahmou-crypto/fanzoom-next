declare module 'sanitize-html' {
  interface IOptions {
    allowedTags?: string[] | false;
    allowedAttributes?: { [key: string]: string[] } | false;
    allowedSchemes?: string[];
    allowedSchemesByTag?: { [key: string]: string[] };
    allowedSchemesAppliedToAttributes?: string[];
    allowedIframeHostnames?: string[];
    allowedIframeDomains?: string[];
    transformTags?: { [key: string]: (tagName: string, attribs: { [key: string]: string }) => { tagName: string; attribs: { [key: string]: string } } };
    textFilter?: (text: string, tagName: string) => string;
    allowedClasses?: { [key: string]: string[] | boolean };
    allowedStyles?: { [key: string]: { [key: string]: RegExp[] } };
    allowedScriptDomains?: string[];
    allowedScriptHostnames?: string[];
    selfClosing?: string[];
    nonBooleanAttributes?: string[];
    disallowedTagsMode?: 'discard' | 'escape' | 'recursiveEscape';
    enforceHtmlBoundary?: boolean;
    nestingLimit?: number;
    parser?: Record<string, unknown>;
  }

  function sanitize(dirty: string, options?: IOptions): string;
  export = sanitize;
}

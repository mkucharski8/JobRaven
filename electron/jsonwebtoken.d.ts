declare module 'jsonwebtoken' {
  export function sign(payload: object, secret: string, options?: object): string
  export function verify(token: string, secret: string, options?: object): unknown
  export function decode(token: string, options?: object): unknown
}

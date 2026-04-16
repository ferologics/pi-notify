declare module "@mariozechner/pi-coding-agent" {
    export interface ExtensionAPI {
        on(event: "agent_end", callback: () => void | Promise<void>): void;
        on(event: string, callback: (...args: unknown[]) => void | Promise<void>): void;
    }
}
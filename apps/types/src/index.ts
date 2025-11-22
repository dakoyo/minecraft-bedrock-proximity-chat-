export interface SyncEvent {
    seq: number;
    type: "move" | "join" | "leave";
    id: string;
    data?: any;
}
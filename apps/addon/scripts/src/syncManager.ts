import { Player } from "@minecraft/server";
import { SyncEvent } from "../../../types/src/index";

export class SyncManager {
    private currentSeq = 0;
    private eventBuffer: SyncEvent[] = [];
    private readonly BUFFER_LIMIT = 200;

    public addEvent(type: 'move' | 'join' | 'leave', player: Player, data?: any) {
        this.currentSeq++;
        const event: SyncEvent = {
            seq: this.currentSeq,
            type: type,
            id: player.name,
            data: data
        };
        this.eventBuffer.push(event);

        if (this.eventBuffer.length > this.BUFFER_LIMIT) {
            this.eventBuffer.shift();
        }
    }

    public getEventsSince(lastKnownSeq: number): { events: SyncEvent[], currentSeq: number, needFullSync: boolean } {
        const oldestSeqInBuffer = this.eventBuffer.length > 0 ? this.eventBuffer[0].seq : this.currentSeq;
        if (lastKnownSeq < oldestSeqInBuffer - 1 && lastKnownSeq !== -1) {
             return { events: [], currentSeq: this.currentSeq, needFullSync: true };
        }

        const diff = this.eventBuffer.filter(e => e.seq > lastKnownSeq);
        return { 
            events: diff, 
            currentSeq: this.currentSeq,
            needFullSync: false 
        };
    }
}
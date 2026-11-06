import { type Service } from "../interfaces/service.interface";
import { Reactive } from "./reactive.service";

export class ProgressService implements Service {
    
    private _loadingCounter:Reactive<number> = new Reactive(0);

    get loadingCounter():Reactive<number> {
        return this._loadingCounter;
    }

    public increaseCounter():void {
        this.loadingCounter.set(this.loadingCounter.value + 1);
    }

    public decreaseCounter():void{
        this.loadingCounter.set(this.loadingCounter.value - 1);
    }

    init(){

    }

    exit(){
        // this._loadingCounter.unsubscribe();
    }

}
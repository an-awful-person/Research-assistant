import { Reactive } from "./reactive.service";
import { Utils } from "./utils.service";

/**
 * Reactive extention for an internal map. Makes it easier to interact with the underlying map.
 */
export class ReactiveMap<T> extends Reactive<Map<string,T>> {

    constructor(){
        super(new Map<string,T>());
    }
    
    /**
     * get value from the internal map
     * @param key 
     * @returns 
     */
    get(key:string): T | undefined {
        return this.value.get(key);
    }

    /**
     * add value to internal map, similar to Map.set(key,value)
     * @param key 
     * @param value 
     */
    add(key:string, value:T): void{
        this.value.set(key,value);
        this.update();
    }

    /**
     * add value to internal map but only when the key is not available yet.
     * @param key 
     * @param value 
     */
    addUnique(key:string, value:T): void{
        if(!this.value.has(key)){
            this.add(key,value);
        }
    }

    /**
     * deletes a value from the internal map
     * @param key 
     */
    delete(key:string): void {
        this.value.delete(key);
        this.update();
    }

    /**
     * see if a key is available in the internal map
     * @param key 
     * @returns 
     */
    has(key:string):boolean {
        return this.value.has(key);
    }

    /**
     * @override create new map so useStates track the changes
     */
    update():void {
        this._tracker$.next(Utils.newMap(this._value));
    }
}
import { Reactive } from "./reactive.service";
import { Utils } from "./utils.service";

/**
 * Reactive extention for an internal array. Makes it easier to interact with the underlying array.
 */
export class ReactiveArray<T> extends Reactive<T[]>{

    constructor(startValue?:T[]){
        super(startValue ?? []);
    }

    /**
     * Adds new value to the internal array
     * @param value 
     */
    push(value:T) : void{
        this.value.push(value);
        this.set(Utils.newArray(this.value));
        this.update();
    }

    /**
     * removes a value from the internal array
     * @param index 
     */
    remove(index:number) : void{
        if(this.value.length > index){
            this.value.splice(index,1);
        }
        this.set(Utils.newArray(this.value));
        this.update();
    }

    /**
     * get the length of the internal array
     * @returns length of the array
     */
    length() : number {
        return this.value.length;
    }

}
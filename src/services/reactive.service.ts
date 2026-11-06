import { Observable, Subject } from "rxjs";
import { type Service } from "../interfaces/service.interface";
import { useEffect } from "react";

/**
 * An object that is reactive easily passable to React child components.
 */
export class Reactive<T> implements Service {
    
    protected _value:T;

    protected _tracker$:Subject<T> = new Subject<T>();

    constructor(starter:T){
        this._value = starter;
    }

    /**
     * Actual value of the reactive container
     */
    get value():T{
        return this._value;
    }

    /**
     * Change the value within the container
     * 
     * Keep in mind that changing value within the container using the actual value does not force an update.
     * This means that react does not know the object changed.
     * Use this function to change the value instead.
     * @param value new value
     */
    set(value:T){
        this._value = value;
        this.update();
    }

    /**
     * Force an update in the listener. Use this if you made changes to the actual value or its children without the set() function.
     */
    update():void{
        this._tracker$.next(this._value);
    }

    /**
     * Change listener. Use this to react on changes to the value.
     * @returns (Observable<T>) observable to subscribe to. Will get noted when the actual value is changed.
     */
    listener():Observable<T>{
        return this._tracker$.asObservable();
    }

    /**
     * Unsubscribes the subject within. Only use when you no longer wish to use the reactive
     */
    unsubscribe():void{
        this._tracker$.unsubscribe();
    }

    /**
     * See if the reactive is already closed or not. Reactives should only be closed when they are no longer needed.
     * @returns boolean
     */
    closed():boolean{
        return this._tracker$.closed;
    }

    init(){

    }

    exit(){
        this._tracker$.unsubscribe();
    }
}

/**
 * useReactive is a function that simplifies the useEffect cycle inside components using Reactives.
 * @param reactive The reactive the useReactive will subscribe to
 * @param setState The state setter that will be adjusted when the subscription gets a new value
 */
export function useReactive<T>(
  reactive: Reactive<T>,
  setState: (value: T) => void
) {
  useEffect(() => {
    const subscription = reactive.listener().subscribe((value) => {
      setState(value);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [reactive, setState]);
}
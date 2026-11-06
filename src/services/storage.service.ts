import type { Service } from "../interfaces/service.interface";

export class StorageService implements Service {

    init(){

    }

    exit(){

    }

    /**
     * You can store values in the browser's local storage using the localStorage API. This approach is simple but has security concerns, as local storage is accessible to all scripts running on the page.
     * @param key 
     * @param value 
     */
    setLocally<T>(key:string, value:T){
        localStorage.setItem(key,JSON.stringify(value));
    }

    getLocally<T>(key:string): T | null {
        const value =  localStorage.getItem(key);
        if(value !== null){
            try{
                return JSON.parse(value);
            } catch {
                return null;
            }
            
        } else {
            return value;
        }
    }

    removeLocally(key:string):void {
        localStorage.removeItem(key);
    }

    /**
     * Similar to local storage, you can use session storage to store values. The main difference is that session storage is deleted when the browser session ends.
     * @param key 
     * @param value 
     */
    setSession<T>(key:string, value: T){
        sessionStorage.setItem(key,JSON.stringify(value));
    }

    getSession<T>(key:string): T | null {
        const value =  sessionStorage.getItem(key);
        if(value !== null){
            return JSON.parse(value);
        } else {
            return value;
        }
    }

}
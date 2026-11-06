import { Observable } from "rxjs";
import { type Service } from "../interfaces/service.interface";
import { type PopupModel } from "../models/popup.model";
import { Reactive } from "./reactive.service";
import { POPUP_TYPE } from "../constants/popup.constants";

export class PopupService implements Service {

    private _popup: Reactive<PopupModel | undefined> = new Reactive<PopupModel | undefined>(undefined);

    private _duration: number = 3000;

    public popupListener(): Observable<PopupModel | undefined> {
        return this._popup.listener();
    }

    public throwPopup(message: string, type: POPUP_TYPE, duration?:number): void {
        this._popup.set({ message: message, type: type, duration: duration });
    }


    get duration(): number {
        return this._duration;
    }

    set duration(value: number) {
        this._duration = value;
    }

    init(){

    }

    exit(){
        // this._popup.unsubscribe();
    }
}
import { POPUP_TYPE } from "../constants/popup.constants"

export type PopupModel = {
    message:string,
    type:POPUP_TYPE,
    duration?:number
}
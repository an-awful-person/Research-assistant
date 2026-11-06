import { Close } from "@mui/icons-material";
import { IconButton, Snackbar, SnackbarContent } from "@mui/material";
import { type JSX, useEffect, useState } from "react";
import { Subscription } from "rxjs";
import { type PopupModel } from "../models/popup.model";
import { ERROR_STYLE, POPUP_TYPE, SUCCESS_STYLE } from "../constants/popup.constants";
import { PopupService } from "../services/popup.service";

export function PopupComponent(props:{
    popupService:PopupService
}): JSX.Element {

    const [showPopup, setShowPopup] = useState(false);
    const [popup, setPopup] = useState<PopupModel | undefined>(undefined)

    useEffect(() => {
        const subscriptions: Subscription[] = [];

        subscriptions.push(props.popupService.popupListener().subscribe(model => {
            setPopup(model);
            setShowPopup(true);
        }));
        
        return(() => {
            subscriptions.forEach(sub => sub.unsubscribe());
        })
    }, [props.popupService])

    return (
        popup ? 
        <Snackbar
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            open={showPopup}
            autoHideDuration={popup.duration ?? props.popupService.duration}
            onClose={() => setShowPopup(false)}
            sx={{ bottom: { sm: '3em' } }}
        >
            <SnackbarContent
                message={popup.message}
                style={popup.type === POPUP_TYPE.ERROR ? ERROR_STYLE : SUCCESS_STYLE}
                action={
                    <IconButton onClick={() => setShowPopup(false)} style={{ color: 'white' }}>
                        <Close />
                    </IconButton>
                }
            />
        </Snackbar>
        : <></>
    )
}
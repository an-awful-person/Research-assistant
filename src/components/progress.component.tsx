import { type JSX, useEffect, useState } from "react";
import { ProgressService } from "../services/progress.service";
import { Subscription } from "rxjs";
import { LinearProgress } from "@mui/material";

export function ProgressBar(props:{
    progressService:ProgressService,
    verticalOffset:number
}) : JSX.Element {
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        const subscriptions:Subscription[] = [];

        subscriptions.push(props.progressService.loadingCounter.listener().subscribe(result => {
            setLoading(result > 0);
        }));

        return (() => {
            subscriptions.forEach(sub => sub.unsubscribe());
        });
        
    },[props.progressService.loadingCounter]);

    return (
        loading ? 
        <LinearProgress style={{ position: 'absolute', top: props.verticalOffset-4, width: '100%', zIndex:'999'}} />
        : <></>
    )
}
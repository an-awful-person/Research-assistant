import { useEffect } from "react";
import { AssistantService } from "./assistant/services/assistant.service";
import type { Service } from "./interfaces/service.interface";
import { ApiService } from "./services/api.service";
import { PopupService } from "./services/popup.service";
import { ProgressService } from "./services/progress.service";
import { StorageService } from "./services/storage.service";
import { ThemeService } from "./services/theme.service";
import { ProgressBar } from "./components/progress.component";
import { PopupComponent } from "./components/popup.component";
import { ThemeComponent } from "./components/theme.component";
import { AssistantComponent } from "./assistant/components/assistant.component";

function App() {
  const popupService = new PopupService();
  const progressService = new ProgressService();
  const apiService = new ApiService(progressService, popupService);

  const storageService = new StorageService();
  const themeService = new ThemeService(storageService);

  const assistantService = new AssistantService(apiService, popupService, storageService);

  const services: Service[] = [apiService, popupService, progressService, storageService, themeService, assistantService];

  useEffect(() => {
    services.forEach((service) => {
      service.init();
    });

    return () => {
      services.forEach((service) => {
        service.exit();
      });
    };
  }, []);

  return (
    <ThemeComponent themeService={themeService}>
      <AssistantComponent assistantService={assistantService} themeService={themeService} />
      <ProgressBar progressService={progressService} verticalOffset={4} />
      <PopupComponent popupService={popupService} />
    </ThemeComponent>
  );
}

export default App;

import { type Service } from "../../interfaces/service.interface";
import { ApiService } from "../../services/api.service";
import { PopupService } from "../../services/popup.service";
import { ReactiveMap } from "../../services/reactiveMap.service";
import { StorageService } from "../../services/storage.service";
import type { ReferenceModel } from "../model/reference.model";
import { DocumentsService } from "./documents.service";
import { ConversationsService } from "./conversations.service";
import { EvidenceService } from "./evidence.service";
import { ExportService } from "./export.service";
import { LLMApiService } from "./llmApi.service";
import { McpService } from "./mcp.service";
import { MediatorService } from "./mediator.service";
import { ModelService } from "./model.service";
import { NominatimService } from "./nominatim.service";
import { RagService } from "./rag.service";
import { SharedKeysService } from "./sharedKeys.service";
import { SkillsService } from "./skills.service";
import { TemperatureService } from "./temperature.service";
import { WebSearchService } from "./webSearch.service";

export class AssistantService implements Service {

    private _globalChatService:MediatorService;
    private _LLMApiService:LLMApiService;
    
    private _apiService:ApiService;
    private _popupService:PopupService;
    private _storageService:StorageService;
    private _nominatimService:NominatimService;
    private _ragService:RagService;
    private _evidenceService:EvidenceService;
    private _webSearchService:WebSearchService;
    private _temperatureService:TemperatureService;
    private _documentsService:DocumentsService;
    private _sharedKeysService:SharedKeysService;
    private _modelService:ModelService;
    private _exportService:ExportService;
    private _conversationsService:ConversationsService;
    private _skillsService:SkillsService;
    private _mcpService:McpService;

    private _services:Service[] = [];

    private _references:ReactiveMap<ReferenceModel> = new ReactiveMap<ReferenceModel>();

    constructor(apiService:ApiService, popupService:PopupService, storageService:StorageService){
        this._apiService = apiService;
        this._popupService = popupService;
        this._storageService = storageService;

        // Agents read the shared keys when they are made, so this comes first.
        this._sharedKeysService = new SharedKeysService(this._apiService);
        this._LLMApiService = new LLMApiService();
        this._temperatureService = new TemperatureService(this._storageService);
        this._modelService = new ModelService(this._storageService, this._LLMApiService);
        this._globalChatService = new MediatorService(this);
        this._nominatimService = new NominatimService(this);
        this._ragService = new RagService(this._LLMApiService);
        this._documentsService = new DocumentsService(this._ragService);
        this._evidenceService = new EvidenceService(this._references);
        this._webSearchService = new WebSearchService(this._apiService, this._storageService);
        this._exportService = new ExportService(this);
        this._conversationsService = new ConversationsService(this);
        this._skillsService = new SkillsService(this);
        this._mcpService = new McpService(this);

        this._services.push(this._LLMApiService);
        this._services.push(this._globalChatService);
        this._services.push(this._nominatimService);
        this._services.push(this._ragService);
        this._services.push(this._evidenceService);
        this._services.push(this._webSearchService);
        this._services.push(this._temperatureService);
        this._services.push(this._modelService);
        this._services.push(this._documentsService);
        this._services.push(this._sharedKeysService);
        this._services.push(this._exportService);
        // Last: it restores the conversation into the chats that the mediator sets up.
        this._services.push(this._conversationsService);
        this._services.push(this._skillsService);
        this._services.push(this._mcpService);
    }

    init(){
        this._services.forEach(service => {
            service.init();
        });
    }

    exit(){
        this._services.forEach(service => {
            service.exit();
        });
    }

    get mediatorService():MediatorService{
        return this._globalChatService;
    }

    get llmApiService():LLMApiService{
        return this._LLMApiService;
    }

    get apiService():ApiService{
        return this._apiService;
    }

    get popupService():PopupService{
        return this._popupService;
    }

    get evidenceService():EvidenceService{
        return this._evidenceService;
    }

    get documentsService():DocumentsService{
        return this._documentsService;
    }

    get temperatureService():TemperatureService{
        return this._temperatureService;
    }

    get modelService():ModelService{
        return this._modelService;
    }

    get skillsService():SkillsService{
        return this._skillsService;
    }

    get mcpService():McpService{
        return this._mcpService;
    }

    get conversationsService():ConversationsService{
        return this._conversationsService;
    }

    get exportService():ExportService{
        return this._exportService;
    }

    get sharedKeysService():SharedKeysService{
        return this._sharedKeysService;
    }

    get webSearchService():WebSearchService{
        return this._webSearchService;
    }

    get ragService():RagService{
        return this._ragService;
    }

    get storageService():StorageService{
        return this._storageService;
    }

    get nominatimService(): NominatimService{
        return this._nominatimService;
    }

    get references(): ReactiveMap<ReferenceModel>{
        return this._references;
    }
}
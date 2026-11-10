import { DeleteOutlined, Search, UploadFile } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import type { CatalogResult, Skill } from "../model/extensions.model";
import { SkillFormatError } from "../services/skillFormat";
import type { SkillsService } from "../services/skills.service";

function CatalogLabels(props: { risk?: string; installs?: number }): ReactNode {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: "0.5em", flexWrap: "wrap" }}>
      {props.risk !== undefined ? <Chip size="small" variant="outlined" color={props.risk === "safe" ? "success" : "warning"} label={`Risk: ${props.risk}`} /> : null}
      {props.installs !== undefined ? (
        <Typography variant="caption" component="span">
          {props.installs.toLocaleString("en")} installs
        </Typography>
      ) : null}
    </Box>
  );
}

/** Finds skills in the public catalogs. Nothing is asked until the user searches. */
function CatalogSearch(props: { service: SkillsService; installed: Skill[]; onOpen: (skill: Skill) => void }): ReactNode {
  // All of this is only what is on screen.
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CatalogResult[] | undefined>(undefined);
  const [failed, setFailed] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [opening, setOpening] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const keyOf = (result: CatalogResult) => `${result.source}/${result.skillId}`;

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2 || searching) return;
    setSearching(true);
    setProblem(undefined);
    setNotes({});
    try {
      const found = await props.service.searchCatalogs(query.trim());
      setResults(found.results);
      setFailed(found.failed);
    } catch (error) {
      setResults(undefined);
      setProblem(error instanceof Error ? error.message : "The search failed.");
    } finally {
      setSearching(false);
    }
  };

  const open = async (result: CatalogResult) => {
    const key = keyOf(result);
    setOpening(key);
    setNotes((current) => ({ ...current, [key]: "" }));
    try {
      const outcome = await props.service.openCatalogSkill(result);
      if ("skill" in outcome) {
        props.onOpen(outcome.skill);
      } else {
        const shown = outcome.otherFiles.slice(0, 6).join(", ");
        const more = outcome.otherFiles.length > 6 ? ` and ${outcome.otherFiles.length - 6} more` : "";
        setNotes((current) => ({ ...current, [key]: `Can't be added, because it isn't solely Markdown. It also has: ${shown}${more}.` }));
      }
    } catch (error) {
      setNotes((current) => ({ ...current, [key]: error instanceof Error ? error.message : "This skill could not be read." }));
    } finally {
      setOpening(undefined);
    }
  };

  return (
    <Box data-testid="skill-search">
      <form onSubmit={(event) => void search(event)}>
        <TextField
          fullWidth
          size="small"
          label="Search for skills"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{
            htmlInput: { "data-testid": "skill-search-input", enterKeyHint: "search", maxLength: 200 },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton type="submit" aria-label="Search for skills" edge="end" disabled={searching || query.trim().length < 2} sx={{ width: 44, height: 44 }}>
                    {searching ? <CircularProgress size={20} data-testid="skill-searching" /> : <Search />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      </form>
      <Typography variant="caption" component="p" sx={{ color: "text.secondary", marginTop: "0.25em" }}>
        Searches skills.sh and Awesome Skills, which get your search words. Only skills that are solely Markdown can be added.
      </Typography>
      {problem !== undefined ? <Alert severity="error" sx={{ marginTop: "0.5em", overflowWrap: "anywhere" }} data-testid="skill-search-problem">{problem}</Alert> : null}
      {failed.length > 0 ? (
        <Alert severity="warning" sx={{ marginTop: "0.5em" }} data-testid="skill-search-failed">
          {failed.join(" and ")} couldn't be searched just now.
        </Alert>
      ) : null}
      {results !== undefined && results.length === 0 ? (
        <Typography variant="body2" sx={{ marginTop: "0.75em", color: "text.secondary" }} data-testid="skill-search-empty">
          Nothing found. Try other words.
        </Typography>
      ) : null}
      {results !== undefined && results.length > 0 ? (
        <List disablePadding sx={{ marginTop: "0.5em", maxHeight: "50vh", overflowY: "auto", border: 1, borderColor: "divider", borderRadius: "8px" }} data-testid="skill-results">
          {results.map((result) => {
            const key = keyOf(result);
            const note = notes[key];
            const added = props.installed.some((skill) => skill.catalog?.repositoryUrl.includes(`/${result.source}`) && skill.name === result.name);
            return (
              <Box key={key} data-testid="skill-result">
                <ListItemButton disabled={added || opening !== undefined} onClick={() => void open(result)} sx={{ minHeight: 44, alignItems: "flex-start", gap: "0.5em" }}>
                  <ListItemText
                    sx={{ overflowWrap: "anywhere" }}
                    primary={result.name}
                    secondary={
                      <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: "0.25em" }}>
                        {result.description !== undefined ? <span>{result.description.length > 200 ? `${result.description.slice(0, 200)}…` : result.description}</span> : null}
                        <span>{result.catalog} · {result.source}{added ? " · Added" : ""}</span>
                        <CatalogLabels risk={result.risk} installs={result.installs} />
                      </Box>
                    }
                    slotProps={{ secondary: { component: "div" } }}
                  />
                  {opening === key ? <CircularProgress size={20} sx={{ marginTop: "0.25em", flexShrink: 0 }} /> : null}
                </ListItemButton>
                {note ? (
                  <Alert severity="warning" sx={{ overflowWrap: "anywhere" }} data-testid="skill-result-note">
                    {note}
                  </Alert>
                ) : null}
              </Box>
            );
          })}
        </List>
      ) : null}
    </Box>
  );
}

/** Shows all of a skill, because a skill is instructions to your model. */
function SkillDialog(props: { skill: Skill | undefined; adding: boolean; replaces: boolean; onAdd: () => void; onClose: () => void }): ReactNode {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const { skill } = props;
  return (
    <Dialog open={skill !== undefined} onClose={props.onClose} fullWidth maxWidth="sm" fullScreen={isPhone} data-testid="skill-dialog">
      <DialogTitle sx={{ overflowWrap: "anywhere" }}>{skill?.name}</DialogTitle>
      <DialogContent sx={{ overflowWrap: "anywhere" }}>
        <Typography variant="body2" sx={{ marginBottom: "1em" }}>
          {skill?.description}
        </Typography>
        {props.adding ? (
          <Alert severity="info" sx={{ marginBottom: "1em" }}>
            A skill is instructions to your model. Read it before adding it, especially if it's from someone you don't know.
          </Alert>
        ) : null}
        {skill?.catalog !== undefined ? (
          <Box sx={{ marginBottom: "1em" }} data-testid="skill-catalog">
            <Typography variant="body2">
              From {skill.catalog.name}:{" "}
              <Link href={skill.catalog.repositoryUrl} target="_blank" rel="noopener noreferrer">
                {skill.catalog.repositoryUrl.replace("https://github.com/", "")}
              </Link>
            </Typography>
            <CatalogLabels risk={skill.catalog.risk} installs={skill.catalog.installs} />
            <Typography variant="caption" component="p" sx={{ color: "text.secondary", marginTop: "0.25em" }}>
              Anyone can publish a skill, and popularity isn't a safety check. A copy is added, which won't change by itself.
            </Typography>
          </Box>
        ) : null}
        {props.adding && props.replaces ? (
          <Alert severity="warning" sx={{ marginBottom: "1em" }} data-testid="skill-replaces">
            This replaces your skill with the same name.
          </Alert>
        ) : null}
        {(skill?.ignored.length ?? 0) > 0 ? (
          <Alert severity="warning" sx={{ marginBottom: "1em" }} data-testid="skill-ignored">
            Left out, because only text is used and nothing is run: {skill?.ignored.join(", ")}
          </Alert>
        ) : null}
        <Box component="pre" sx={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", margin: 0 }} data-testid="skill-text">
          {skill?.body}
        </Box>
        {(skill?.files.length ?? 0) > 0 ? (
          <Typography variant="caption" component="p" sx={{ marginTop: "1em" }}>
            Files it can read: {skill?.files.map((file) => file.name).join(", ")}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ padding: "0.5em 1.5em 1.25em 1.5em" }}>
        <Button onClick={props.onClose} sx={{ minHeight: 44 }}>
          {props.adding ? "Cancel" : "Close"}
        </Button>
        {props.adding ? (
          <Button variant="contained" onClick={props.onAdd} sx={{ minHeight: 44 }} data-testid="skill-add">
            Add skill
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

/** The skills: which are on, and adding your own. */
export function SkillsSettingsComponent(props: { service: SkillsService }): ReactNode {
  const [skills, setSkills] = useState<Skill[]>(props.service.skills.value);
  const [disabled, setDisabled] = useState<string[]>(props.service.disabled.value);
  const [problems, setProblems] = useState<string[]>(props.service.problems.value);
  useReactive(props.service.skills, setSkills);
  useReactive(props.service.disabled, setDisabled);
  useReactive(props.service.problems, setProblems);

  // What is shown in the dialog, and if an upload failed: only what is on screen.
  const [preview, setPreview] = useState<Skill | undefined>(undefined);
  const [isNew, setIsNew] = useState<boolean>(false);
  const [uploadProblem, setUploadProblem] = useState<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setUploadProblem(undefined);
    try {
      setPreview(await props.service.readUpload(file));
      setIsNew(true);
    } catch (error) {
      setUploadProblem(error instanceof SkillFormatError ? error.message : "This file can't be read.");
    }
  };

  const add = () => {
    if (preview !== undefined) void props.service.addPersonal(preview);
    setPreview(undefined);
  };

  return (
    <Box sx={{ textAlign: "left", padding: "1em" }} data-testid="skills-tab">
      <Typography variant="body2" sx={{ marginBottom: "1em" }}>
        Skills are instructions for a kind of task. The model picks one when a question fits, or type <code>/</code> in the
        question box to choose one yourself. Only their text is used: scripts in a skill are never run.
      </Typography>
      <CatalogSearch
        service={props.service}
        installed={skills}
        onOpen={(skill) => {
          setPreview(skill);
          setIsNew(true);
        }}
      />
      <Box sx={{ height: "0.75em" }} />
      <input ref={input} type="file" hidden accept=".md,.markdown,.zip" onChange={(event) => void upload(event)} data-testid="skill-input" />
      <Button fullWidth variant="outlined" startIcon={<UploadFile />} onClick={() => input.current?.click()} sx={{ minHeight: 44, textTransform: "none" }}>
        Add a skill (SKILL.md or .zip)
      </Button>
      {uploadProblem !== undefined ? (
        <Alert severity="error" sx={{ marginTop: "0.5em", overflowWrap: "anywhere" }} data-testid="skill-problem">
          {uploadProblem}
        </Alert>
      ) : null}
      {problems.map((problem) => (
        <Alert key={problem} severity="warning" sx={{ marginTop: "0.5em", overflowWrap: "anywhere" }}>
          {problem}
        </Alert>
      ))}

      {skills.length === 0 ? (
        <Typography variant="body2" sx={{ marginTop: "1em", color: "text.secondary" }} data-testid="skills-empty">
          No skills yet. The computer's owner can put them in the skills folder, for everyone.
        </Typography>
      ) : (
        <List>
          {skills.map((skill) => (
            <ListItem key={skill.id} disableGutters sx={{ alignItems: "flex-start" }} data-testid="skill-item">
              <Switch
                checked={!disabled.includes(skill.id)}
                onChange={(event) => props.service.setEnabled(skill.id, event.target.checked)}
                slotProps={{ input: { "aria-label": `Use skill ${skill.name}` } }}
              />
              <ListItemText
                sx={{ overflowWrap: "anywhere", cursor: "pointer" }}
                onClick={() => {
                  setPreview(skill);
                  setIsNew(false);
                }}
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: "0.5em", flexWrap: "wrap" }}>
                    {skill.name}
                    <Chip size="small" variant="outlined" label={skill.origin === "owner" ? "For everyone" : "Yours"} />
                  </Box>
                }
                secondary={skill.description}
              />
              {skill.origin === "personal" ? (
                <Tooltip title="Delete skill" placement="left">
                  <IconButton aria-label={`Delete skill ${skill.name}`} onClick={() => void props.service.deletePersonal(skill.id)} sx={{ width: 44, height: 44 }}>
                    <DeleteOutlined />
                  </IconButton>
                </Tooltip>
              ) : null}
            </ListItem>
          ))}
        </List>
      )}
      <SkillDialog
        skill={preview}
        adding={isNew}
        replaces={preview !== undefined && skills.some((skill) => skill.id === preview.id)}
        onAdd={add}
        onClose={() => setPreview(undefined)}
      />
    </Box>
  );
}

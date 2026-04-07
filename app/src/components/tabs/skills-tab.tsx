import { useState, useCallback } from "react";
import { SkillsGrid, SkillDetailPage } from "@houston-ai/skills";
import type { Skill, CommunitySkill } from "@houston-ai/skills";
import {
  useSkills,
  useSkillDetail,
  useSaveSkill,
  useInstallCommunitySkill,
  useInstallSkillFromRepo,
  useSearchCommunitySkills,
} from "../../hooks/queries";
import type { TabProps } from "../../lib/types";

export default function SkillsTab({ agent }: TabProps) {
  const path = agent.folderPath;
  const { data: summaries, isLoading: loading } = useSkills(path);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const { data: detail } = useSkillDetail(path, selectedName ?? undefined);
  const saveSkill = useSaveSkill(path);
  const installCommunity = useInstallCommunitySkill(path);
  const installFromRepo = useInstallSkillFromRepo(path);
  const searchCommunity = useSearchCommunitySkills();

  const skills: Skill[] = (summaries ?? []).map((s) => ({
    id: s.name,
    name: s.name,
    description: s.description,
    instructions: "",
    learnings: "",
    file_path: s.name,
  }));

  const selectedSkill = selectedName && detail
    ? { id: selectedName, name: detail.name, description: detail.description, instructions: detail.content, learnings: "", file_path: selectedName }
    : null;

  const handleSkillClick = useCallback((skill: Skill) => {
    setSelectedName(skill.name);
  }, []);

  const handleSave = useCallback(
    async (skillName: string, instructions: string) => {
      await saveSkill.mutateAsync({ name: skillName, content: instructions });
    },
    [saveSkill],
  );

  const handleSearch = useCallback(
    async (query: string) => {
      const results = await searchCommunity.mutateAsync(query);
      return results as CommunitySkill[];
    },
    [searchCommunity],
  );

  const handleInstallCommunity = useCallback(
    async (skill: CommunitySkill) => {
      const name = await installCommunity.mutateAsync({ source: skill.source, skillId: skill.skillId });
      return name;
    },
    [installCommunity],
  );

  const handleInstallFromRepo = useCallback(
    async (source: string) => {
      const installed = await installFromRepo.mutateAsync(source);
      return installed;
    },
    [installFromRepo],
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        {selectedSkill ? (
          <SkillDetailPage
            skill={selectedSkill}
            onBack={() => setSelectedName(null)}
            onSave={handleSave}
          />
        ) : (
          <SkillsGrid
            skills={skills}
            loading={loading}
            onSkillClick={handleSkillClick}
            onSearch={handleSearch}
            onInstallCommunity={handleInstallCommunity}
            onInstallFromRepo={handleInstallFromRepo}
          />
        )}
      </div>
    </div>
  );
}

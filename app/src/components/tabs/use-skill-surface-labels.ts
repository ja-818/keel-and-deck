import { useTranslation } from "react-i18next";

export function useSkillSurfaceLabels() {
  const { t } = useTranslation(["skills", "common"]);

  const skillDetailLabels = {
    notFound: t("skills:detail.notFound"),
    backAria: t("skills:detail.backAria"),
    saveChanges: t("skills:detail.saveChanges"),
    savingChanges: t("skills:detail.savingChanges"),
    moreActions: t("skills:detail.moreActions"),
    delete: t("skills:detail.delete"),
    deleteTitle: (name: string) => t("skills:detail.deleteTitle", { name }),
    deleteDescription: t("skills:detail.deleteDescription"),
    deleteConfirmLabel: t("common:actions.delete"),
    instructionsPlaceholder: t("skills:detail.instructionsPlaceholder"),
  };

  const skillsGridLabels = {
    loading: t("skills:grid.loading"),
    emptyTitle: t("skills:grid.emptyTitle"),
    emptyDescription: t("skills:grid.emptyDescription"),
    addSkill: t("skills:grid.addSkill"),
    descriptionShort: t("skills:grid.descriptionShort"),
    deleteTitle: (name: string) => t("skills:detail.deleteTitle", { name }),
    deleteDescription: t("skills:detail.deleteDescription"),
    deleteConfirmLabel: t("common:actions.delete"),
    addDialog: {
      title: t("skills:addDialog.title"),
      description: t("skills:addDialog.description"),
      storeTab: t("skills:addDialog.storeTab"),
      repoTab: t("skills:addDialog.repoTab"),
      store: {
        searchPlaceholder: t("skills:addDialog.store.searchPlaceholder"),
        noResults: (query: string) => t("skills:addDialog.store.noResults", { query }),
        minQuery: t("skills:addDialog.store.minQuery"),
        searchUnavailable: t("skills:addDialog.store.searchUnavailable"),
        typeToSearch: t("skills:addDialog.store.typeToSearch"),
        installCount: (count: number, formatted: string) =>
          t("skills:addDialog.store.installCount", { count, formatted }),
        installSkill: (name: string) => t("skills:addDialog.store.installSkill", { name }),
        installedSkill: (name: string) =>
          t("skills:addDialog.store.installedSkill", { name }),
      },
      repo: {
        sourcePlaceholder: t("skills:addDialog.repo.sourcePlaceholder"),
        findSkills: t("skills:addDialog.repo.findSkills"),
        installSelected: (count: number) =>
          t("skills:addDialog.repo.installSelected", { count }),
        skillsFound: (count: number) => t("skills:addDialog.repo.skillsFound", { count }),
        selectAll: t("skills:addDialog.repo.selectAll"),
        deselectAll: t("skills:addDialog.repo.deselectAll"),
        inputHint: t("skills:addDialog.repo.inputHint"),
        installedSummary: (count: number, names: string) =>
          t("skills:addDialog.repo.installedSummary", { count, names }),
        installAnotherRepo: t("skills:addDialog.repo.installAnotherRepo"),
      },
    },
  };

  return { skillDetailLabels, skillsGridLabels };
}

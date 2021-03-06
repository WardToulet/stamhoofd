<template>
    <div class="st-view group-members-view background">
        <STNavigationBar :sticky="false">
            <template #left>
                <BackButton v-if="canPop" slot="left" @click="pop" />
                <STNavigationTitle v-else>
                    <span class="icon-spacer">{{ title }}</span>
                    <span v-if="!loading && maxMembers" class="style-tag" :class="{ error: isFull}">{{ members.length }} / {{ maxMembers }}</span>

                    <button v-if="hasWaitingList" class="button text" @click="openWaitingList">
                        <span class="icon clock-small" />
                        <span>Wachtlijst</span>
                    </button>

                    <button v-if="cycleOffset === 0 && !waitingList" class="button text" @click="addMember">
                        <span class="icon add" />
                        <span>Nieuw</span>
                    </button>
                </STNavigationTitle>
            </template>
            <template #middle>
                <div />
            </template>
            <template #right>
                <select v-if="!waitingList" v-model="selectedFilter" class="input hide-small">
                    <option v-for="(filter, index) in filters" :key="index" :value="index">
                        {{ filter.getName() }}
                    </option>
                </select>
                <input v-model="searchQuery" class="input search" placeholder="Zoeken" @input="searchQuery = $event.target.value">
            </template>
        </STNavigationBar>
    
        <main>
            <h1 v-if="canPop">
                <span class="icon-spacer">{{ title }}</span>

                <button v-if="hasWaitingList" class="button text" @click="openWaitingList">
                    <span class="icon clock-small" />
                    <span>Wachtlijst</span>
                </button>

                <button v-if="cycleOffset === 0 && !waitingList" class="button text" @click="addMember">
                    <span class="icon add" />
                    <span>Nieuw</span>
                </button>
            </h1>
            <span v-if="titleDescription" class="style-description title-description">{{ titleDescription }}</span>

            <Spinner v-if="loading" class="center" />
            <table v-else class="data-table">
                <thead>
                    <tr>
                        <th class="prefix">
                            <Checkbox
                                v-model="selectAll"
                            />
                        </th>
                        <th @click="toggleSort('name')">
                            Naam
                            <span
                                class="sort-arrow"
                                :class="{
                                    up: sortBy == 'name' && sortDirection == 'ASC',
                                    down: sortBy == 'name' && sortDirection == 'DESC',
                                }"
                            />
                        </th>
                        <th class="hide-smartphone" @click="toggleSort('info')">
                            Leeftijd
                            <span
                                class="sort-arrow"
                                :class="{
                                    up: sortBy == 'info' && sortDirection == 'ASC',
                                    down: sortBy == 'info' && sortDirection == 'DESC',
                                }"
                            />
                        </th>
                        <th class="hide-smartphone" @click="toggleSort('status')">
                            {{ waitingList ? "Op wachtlijst sinds" : "Status" }}
                            <span
                                class="sort-arrow"
                                :class="{
                                    up: sortBy == 'status' && sortDirection == 'ASC',
                                    down: sortBy == 'status' && sortDirection == 'DESC',
                                }"
                            />
                        </th>
                        <th>Acties</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="member in sortedMembers" :key="member.id" @click="showMember(member)" @contextmenu.prevent="showMemberContextMenu($event, member.member)">
                        <td class="prefix" @click.stop="">
                            <Checkbox v-model="member.selected" @change="onChanged(member)" />
                        </td>
                        <td>
                            <h2 class="style-title-list">
                                <div
                                    v-if="!waitingList && isNew(member.member)"
                                    v-tooltip="'Ingeschreven op ' + formatDate(registrationDate(member.member))"
                                    class="new-member-bubble"
                                />
                                {{ member.member.name }}
                                <span v-if="waitingList && canRegister(member.member)" v-tooltip="'Dit lid kan zich inschrijven via de uitnodiging'" class="style-tag warn">Toegelaten</span>
                            </h2>
                            <p v-if="!group" class="style-description-small">
                                {{ member.member.groups.map(g => g.settings.name ).join(", ") }}
                            </p>
                            <p v-if="member.member.details && !member.member.details.isPlaceholder" class="style-description-small only-smartphone">
                                {{ member.member.details.age }} jaar
                            </p>
                        </td>
                        <td v-if="member.member.details && !member.member.details.isPlaceholder" class="minor hide-smartphone">
                            {{ member.member.details.age }} jaar
                        </td>
                        <td v-else class="minor hide-smartphone">
                            /
                        </td>
                        <td class="hide-smartphone member-description">
                            <p v-text="getMemberDescription(member.member)" />
                        </td>
                        <td>
                            <button v-if="!member.member.details || member.member.details.isPlaceholder" v-tooltip="'De sleutel om de gegevens van dit lid te bekijken ontbreekt'" class="button icon gray lock-missing" />
                            <button class="button icon gray more" @click.stop="showMemberContextMenu($event, member.member)" />
                        </td>
                    </tr>
                </tbody>
            </table>

            <template v-if="!loading && members.length == 0">
                <p v-if="cycleOffset === 0" class="info-box">
                    Er zijn nog geen leden ingeschreven in deze leeftijdsgroep.
                </p>

                <p v-else class="info-box">
                    Er zijn nog geen leden ingeschreven in deze inschrijvingsperiode.
                </p>
            </template>

            

            <div v-if="canGoBack || canGoNext" class="history-navigation-bar">
                <button v-if="canGoBack" class="button text gray" @click="goBack">
                    <span class="icon arrow-left" />
                    <span>Vorige inschrijvingsperiode</span>
                </button>

                <button v-if="canGoNext" class="button text gray" @click="goNext">
                    <span>Volgende inschrijvingsperiode</span>
                    <span class="icon arrow-right" />
                </button>
            </div>
        </main>

        <STToolbar>
            <template #left>
                {{ selectionCount ? selectionCount : "Geen" }} {{ selectionCount == 1 ? "lid" : "leden" }} geselecteerd
                <template v-if="selectionCountHidden">
                    (waarvan {{ selectionCountHidden }} verborgen)
                </template>
            </template>
            <template #right>
                <button v-if="waitingList" class="button secundary" :disabled="selectionCount == 0" @click="openMail()">
                    Mailen
                </button>
                <button v-if="waitingList" class="button secundary" :disabled="selectionCount == 0" @click="allowMembers(false)">
                    Toelating intrekken
                </button>
                <LoadingButton v-if="waitingList" :loading="actionLoading">
                    <button class="button primary" :disabled="selectionCount == 0" @click="allowMembers(true)">
                        <span class="dropdown-text">
                            Toelaten
                        </span>
                        <div class="dropdown" @click.stop="openMailDropdown" />
                    </button>
                </LoadingButton>
                <template v-else>
                    <button class="button secundary hide-smartphone" :disabled="selectionCount == 0" @click="openSamenvatting">
                        Samenvatting
                    </button>
                    <LoadingButton :loading="actionLoading">
                        <button class="button primary" :disabled="selectionCount == 0" @click="openMail()">
                            <span class="dropdown-text">Mailen</span>
                            <div class="dropdown" @click.stop="openMailDropdown" />
                        </button>
                    </LoadingButton>
                </template>
            </template>
        </STToolbar>
    </div>
</template>

<script lang="ts">
import { ComponentWithProperties, HistoryManager } from "@simonbackx/vue-app-navigation";
import { NavigationMixin } from "@simonbackx/vue-app-navigation";
import { NavigationController } from "@simonbackx/vue-app-navigation";
import { SegmentedControl,TooltipDirective as Tooltip } from "@stamhoofd/components";
import { STNavigationBar } from "@stamhoofd/components";
import { BackButton, LoadingButton,Spinner, STNavigationTitle } from "@stamhoofd/components";
import { Checkbox } from "@stamhoofd/components"
import { STToolbar } from "@stamhoofd/components";
import { EncryptedMemberWithRegistrationsPatch, Group, Member,MemberWithRegistrations, Registration, WaitingListType } from '@stamhoofd/structures';
import { Formatter } from '@stamhoofd/utility';
import { Component, Mixins,Prop } from "vue-property-decorator";

import { CanNotSwimFilter, NoFilter, NotPaidFilter, RecordTypeFilter } from "../../../classes/member-filters";
import { MemberChangeEvent,MemberManager } from '../../../classes/MemberManager';
import { OrganizationManager } from "../../../classes/OrganizationManager";
import MailView from "../mail/MailView.vue";
import EditMemberView from '../member/edit/EditMemberView.vue';
import MemberContextMenu from "../member/MemberContextMenu.vue";
import MemberSummaryView from '../member/MemberSummaryView.vue';
import MemberView from "../member/MemberView.vue";
import GroupListSelectionContextMenu from "./GroupListSelectionContextMenu.vue";

class SelectableMember {
    member: MemberWithRegistrations;
    selected = true;

    constructor(member: MemberWithRegistrations, selected = true) {
        this.member = member;
        this.selected = selected
    }
}

@Component({
    components: {
        Checkbox,
        STNavigationBar,
        STNavigationTitle,
        STToolbar,
        BackButton,
        Spinner,
        LoadingButton,
        SegmentedControl
    },
    directives: { Tooltip },
})
export default class GroupMembersView extends Mixins(NavigationMixin) {
    tabLabels = ["Ingeschreven", "Wachtlijst"]
    tabs = ["all", "waitingList"]
    tab = this.tabs[0]

    @Prop()
    group!: Group | null;

    @Prop({ default: false })
    waitingList!: boolean;

    members: SelectableMember[] = [];
    searchQuery = "";
    filters = [new NoFilter(), new NotPaidFilter(), new CanNotSwimFilter(), ...RecordTypeFilter.generateAll()];
    selectedFilter = 0;
    selectionCountHidden = 0;
    sortBy = "info";
    sortDirection = "ASC";
    cycleOffset = 0

    loading = false;

    actionLoading = false
    cachedWaitingList: boolean | null = null

    mounted() {
        //this.reload();

        // Set url
        if (this.group) {
            HistoryManager.setUrl("/groups/"+Formatter.slug(this.group.settings.name))
            document.title = "Stamhoofd - "+this.group.settings.name
        } else {
            HistoryManager.setUrl("/groups/all")    
            document.title = "Stamhoofd - Alle leden"
        }
    }

    get canGoBack() {
        if (!this.group) {
            return false
        }
        return this.group.cycle >= this.cycleOffset // always allow to go to -1
    }

    get canGoNext() {
        return this.cycleOffset > 0
    }

    goNext() {
        this.cycleOffset--
        this.reload()
    }

    goBack() {
        this.cycleOffset++
        this.reload()
    }

    onUpdateMember(type: MemberChangeEvent, member: MemberWithRegistrations | null) {
        if (type == "changedGroup" || type == "deleted" || type == "created" || type == "payment" || type == "encryption") {
            this.reload()
        }
    }

    activated() {
        this.reload();
        MemberManager.addListener(this, this.onUpdateMember)
    }

    deactivated() {
        MemberManager.removeListener(this)
    }

    get isFull() {
        if (!this.group || this.group.settings.maxMembers === null) {
            return false;
        }
        return this.members.length >= this.group.settings.maxMembers
    }

    get maxMembers() {
         if (!this.group || this.group.settings.maxMembers === null) {
            return 0;
        }
        return this.group.settings.maxMembers
    }

    checkWaitingList() {
        MemberManager.loadMembers(this.group?.id ?? null, true).then((members) => {
            this.cachedWaitingList = members.length > 0
        }).catch((e) => {
            console.error(e)
        })
    }

    reload() {
        this.loading = true;
        MemberManager.loadMembers(this.group?.id ?? null, this.waitingList, this.cycleOffset).then((members) => {
            this.members = members.map((member) => {
                return new SelectableMember(member, !this.waitingList);
            }) ?? [];
        }).catch((e) => {
            console.error(e)
        }).finally(() => {
            this.loading = false

            if (!this.waitingList && this.group && this.group.hasWaitingList) {
                this.checkWaitingList()
            }
        })
    }

    openWaitingList() {
        this.show(new ComponentWithProperties(GroupMembersView, {
            group: this.group,
            waitingList: true
        }))
    }

    get hasWaitingList() {
        if (this.waitingList) {
            return false;
        }
        if (this.cachedWaitingList !== null) {
            return this.cachedWaitingList
        }
        if (!this.group) {
            return false;
        }
        return this.group.settings.waitingListType == WaitingListType.All || this.group.settings.waitingListType == WaitingListType.ExistingMembersFirst
    }

    get title() {
        return this.waitingList ? "Wachtlijst" : (this.group ? this.group.settings.name : "Alle leden")
    }

    get titleDescription() {
        if (this.cycleOffset === 1) {
            return "Dit is de vorige inschrijvingsperiode"
        }
        if (this.cycleOffset > 1) {
            return "Dit is "+this.cycleOffset+" inschrijvingsperiodes geleden"
        }
        return ""
    }

    formatDate(date: Date) {
        return Formatter.dateTime(date)
    }

    registrationDate(member: MemberWithRegistrations) {
        if (member.registrations.length == 0) {
            return new Date()
        }
        const reg = !this.group ? member.registrations[0] : member.registrations.find(r => r.groupId === this.group!.id)
        if (!reg) {
            return new Date()
        }

        if (!reg.registeredAt || this.waitingList) {
            return reg.createdAt
        }
        
        return reg.registeredAt
    }

    addMember() {
        this.present(new ComponentWithProperties(NavigationController, {
            root: new ComponentWithProperties(EditMemberView, {

            })
        }).setDisplayStyle("popup"))
    }

    isNew(member: MemberWithRegistrations) {
        if (!this.group) {
            return false
        }
        const reg = member.registrations.find(r => r.groupId === this.group!.id)
        if (!reg) {
            return false
        }

        if (!reg.registeredAt) {
            return true
        }
        
        return reg.registeredAt > new Date(new Date().getTime() - 1000 * 60 * 60 * 24 * 14)
    }

    get sortedMembers(): SelectableMember[] {
        if (this.sortBy == "info") {
            return this.filteredMembers.sort((a, b) => {
                if (!a.member.details && !b.member.details) {
                    return 0
                }
                if (!a.member.details) {
                    return 1
                }
                if (!b.member.details) {
                    return -1
                }
                if (this.sortDirection == "ASC") {
                    return (a.member.details.age ?? 99) - (b.member.details.age ?? 99);
                }
                return (b.member.details.age ?? 99) - (a.member.details.age ?? 99);
            });
        }

        if (this.sortBy == "name") {
            const s = Member.sorterByName(this.sortDirection)
            return this.filteredMembers.sort((a, b) => s(a.member, b.member));
        }

        if (this.sortBy == "status") {
            if (this.waitingList) {
                return this.filteredMembers.sort((a, b) => {
                    if (this.sortDirection == "ASC") {
                        if (this.registrationDate(a.member) > this.registrationDate(b.member)) {
                            return 1;
                        }
                        if (this.registrationDate(a.member) < this.registrationDate(b.member)) {
                            return -1;
                        }
                        return 0;
                    }
                    if (this.registrationDate(a.member) > this.registrationDate(b.member)) {
                        return -1;
                    }
                    if (this.registrationDate(a.member) < this.registrationDate(b.member)) {
                        return 1;
                    }
                    return 0;
                });
            }
            return this.filteredMembers.sort((a, b) => {
                const aa = this.getMemberDescription(a.member).toLowerCase()
                const bb = this.getMemberDescription(b.member).toLowerCase()
                if (this.sortDirection == "ASC") {
                    if (aa > bb) {
                        return 1;
                    }
                    if (aa < bb) {
                        return -1;
                    }
                    return 0;
                }
                if (aa > bb) {
                    return -1;
                }
                if (aa < bb) {
                    return 1;
                }
                return 0;
            });
        }
        return this.filteredMembers;
    }

    isDescriptiveFilter() {
        return !!((this.filters[this.selectedFilter] as any).getDescription)
    }

    getMemberDescription(member: MemberWithRegistrations) {
        if (this.waitingList) {
            return this.formatDate(this.registrationDate(member))
        }

        if (this.isDescriptiveFilter()) {
            return (this.filters[this.selectedFilter] as any).getDescription(member, OrganizationManager.organization)
        }

        return member.info
    }

    get filteredMembers(): SelectableMember[] {
        this.selectionCountHidden = 0;
        const filtered = this.members.filter((member: SelectableMember) => {
            if (this.filters[this.selectedFilter].doesMatch(member.member, OrganizationManager.organization)) {
                return true;
            }
            this.selectionCountHidden += member.selected ? 1 : 0;
            return false;
        });

        if (this.searchQuery == "") {
            return filtered;
        }
        return filtered.filter((member: SelectableMember) => {
            if (member.member.details && member.member.details.matchQuery(this.searchQuery)) {
                return true;
            }
            this.selectionCountHidden += member.selected ? 1 : 0;
            return false;
        });
    }

    get selectionCount(): number {
        let val = 0;
        this.members.forEach((member) => {
            if (member.selected) {
                val++;
            }
        });
        return val;
    }

    toggleSort(field: string) {
        if (this.sortBy == field) {
            if (this.sortDirection == "ASC") {
                this.sortDirection = "DESC";
            } else {
                this.sortDirection = "ASC";
            }
            return;
        }
        this.sortBy = field;
    }

    next() {
        this.show(new ComponentWithProperties(GroupMembersView, {}));
    }

    onChanged(_selectableMember: SelectableMember) {
        // do nothing for now
    }

    getPreviousMember(member: MemberWithRegistrations): MemberWithRegistrations | null {
        for (let index = 0; index < this.sortedMembers.length; index++) {
            const _member = this.sortedMembers[index];
            if (_member.member.id == member.id) {
                if (index == 0) {
                    return null;
                }
                return this.sortedMembers[index - 1].member;
            }
        }
        return null;
    }

    getNextMember(member: MemberWithRegistrations): MemberWithRegistrations | null {
        for (let index = 0; index < this.sortedMembers.length; index++) {
            const _member = this.sortedMembers[index];
            if (_member.member.id == member.id) {
                if (index == this.sortedMembers.length - 1) {
                    return null;
                }
                return this.sortedMembers[index + 1].member;
            }
        }
        return null;
    }

    showMember(selectableMember: SelectableMember) {
        const component = new ComponentWithProperties(NavigationController, {
            root: new ComponentWithProperties(MemberView, {
                member: selectableMember.member,
                // eslint-disable-next-line @typescript-eslint/unbound-method
                getNextMember: this.getNextMember,
                // eslint-disable-next-line @typescript-eslint/unbound-method
                getPreviousMember: this.getPreviousMember,

                group: this.group,
                cycleOffset: this.cycleOffset,
                waitingList: this.waitingList
            }),
        });
        component.modalDisplayStyle = "popup";
        this.present(component);
    }

    get selectAll() {
        return this.selectionCount - this.selectionCountHidden >= this.filteredMembers.length && this.filteredMembers.length > 0
    }

    set selectAll(selected: boolean) {
        this.filteredMembers.forEach((member) => {
            member.selected = selected;
        });
    }

    showMemberContextMenu(event, member: MemberWithRegistrations) {
        const displayedComponent = new ComponentWithProperties(MemberContextMenu, {
            x: event.clientX,
            y: event.clientY + 10,
            member: member,
            group: this.group,
            cycleOffset: this.cycleOffset,
            waitingList: this.waitingList
        });
        this.present(displayedComponent.setDisplayStyle("overlay"));
    }

    getSelectedMembers(): MemberWithRegistrations[] {
        return this.members
            .filter((member: SelectableMember) => {
                return member.selected;
            })
            .map((member: SelectableMember) => {
                return member.member;
            });
    }

    canRegister(member: MemberWithRegistrations) {
        if (!this.group) {
            return false
        }
        return member.registrations.find(r => r.groupId == this.group!.id && r.waitingList && r.canRegister && r.cycle == this.group!.cycle)
    }

    async allowMembers(allow = true) {
        if (this.actionLoading) {
            return;
        }

        const members = this.getSelectedMembers().filter(m => !this.group || (allow && m.waitingGroups.find(r => r.id === this.group!.id)) || (!allow && m.acceptedWaitingGroups.find(r => r.id === this.group!.id)))
        if (members.length == 0) {
            return;
        }

        this.actionLoading = true;
        try {
            const patches = MemberManager.getPatchArray()
            for (const member of members) {
                const registrationsPatch = MemberManager.getRegistrationsPatchArray()

                const registration = member.registrations.find(r => r.groupId == this.group!.id && r.waitingList == true && r.cycle == this.group!.cycle)
                if (!registration) {
                    throw new Error("Not found")
                }
                registrationsPatch.addPatch(Registration.patchType().create({
                    id: registration.id,
                    canRegister: allow
                }))

                patches.addPatch(EncryptedMemberWithRegistrationsPatch.create({
                    id: member.id,
                    registrations: registrationsPatch
                }))
            }
            await MemberManager.patchMembers(patches)
        } catch (e) {
            console.error(e)
            // todo
        }
        this.actionLoading = false
        this.reload()

        if (allow) {
            this.openMail("Je kan nu inschrijven!")
        }
    }

    openMail(subject = "") {
        const displayedComponent = new ComponentWithProperties(NavigationController, {
            root: new ComponentWithProperties(MailView, {
                members: this.getSelectedMembers(),
                group: this.group,
                defaultSubject: subject
            })
        });
        this.present(displayedComponent.setDisplayStyle("popup"));
    }

    openMailDropdown(event) {
        if (this.selectionCount == 0) {
            return;
        }
        const displayedComponent = new ComponentWithProperties(GroupListSelectionContextMenu, {
            x: event.clientX,
            y: event.clientY + 10,
            members: this.getSelectedMembers(),
            group: this.group,
            cycleOffset: this.cycleOffset,
            waitingList: this.waitingList
        });
        this.present(displayedComponent.setDisplayStyle("overlay"));
    }

    openSamenvatting() {
        const displayedComponent = new ComponentWithProperties(NavigationController, {
            root: new ComponentWithProperties(MemberSummaryView, {
                members: this.getSelectedMembers(),
                group: this.group
            })
        });
        this.present(displayedComponent.setDisplayStyle("popup"));
    }
}
</script>

<style lang="scss">
@use "@stamhoofd/scss/base/variables.scss" as *;
@use '@stamhoofd/scss/base/text-styles.scss';

.group-members-view {
    .new-member-bubble {
        display: inline-block;
        vertical-align: middle;
        width: 5px;
        height: 5px;
        border-radius: 2.5px;
        background: $color-primary;
        margin-left: -10px;
        margin-right: 5px;
    }

    .member-description > p {
        white-space: pre-wrap;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .history-navigation-bar {
        display: flex;
        padding-top: 20px;
        justify-content: space-between;
        align-items: center;
        flex-direction: row;
    }

    .title-description {
        margin-bottom: 20px;
    }
}
</style>

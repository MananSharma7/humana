import { LightningElement, api } from 'lwc';

export default class AaCustomerSnapshot extends LightningElement {
    @api snapshotData;

    isExpanded = true;

    toggleSnapshot() {
        this.isExpanded = !this.isExpanded;
    }

    get accordionIcon() {
        return this.isExpanded
            ? 'utility:chevrondown'
            : 'utility:chevronright';
    }

    get callerNameDisplay() {
        return this.snapshotData && this.snapshotData.callerName ? this.snapshotData.callerName : 'None';
    }

    handleEndSession(event) {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('endsession'));
    }

    get isMember() {
        return this.snapshotData?.recordType === 'Member';
    }

    get isLead() {
        return this.snapshotData?.recordType === 'Lead';
    }

    get showVeteranBadge() {
        return (
            typeof this.snapshotData?.veteran === 'string' &&
            this.snapshotData.veteran.trim().toLowerCase() === 'self'
        );
    }

    get showApplicationStatusBadge() {
        return (
            this.isLead &&
            this.snapshotData?.applicationStatus
        );
    }

    get birthdayDaysRemaining() {
        if (!this.snapshotData?.dob) {
            return null;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [year, month, day] =
            this.snapshotData.dob.split('-');

        const dob = new Date(
            Number(year),
            Number(month) - 1,
            Number(day)
        );

        let nextBirthday = new Date(
            today.getFullYear(),
            dob.getMonth(),
            dob.getDate()
        );

        nextBirthday.setHours(0, 0, 0, 0);

        if (nextBirthday < today) {
            nextBirthday.setFullYear(today.getFullYear() + 1);
        }

        return Math.ceil(
            (nextBirthday - today) /
            (1000 * 60 * 60 * 24)
        );
    }

    get showBirthdayBadge() {
        return (
            this.birthdayDaysRemaining !== null &&
            this.birthdayDaysRemaining <= 30
        );
    }

    get formattedDob() {
        if (!this.snapshotData?.dob) {
            return '';
        }

        const [year, month, day] =
            this.snapshotData.dob.split('-');

        return `${Number(month)}/${Number(day)}/${year}`;
    }
}

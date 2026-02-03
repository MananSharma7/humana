export { cardMetaDataProperties };

export class CardModal {
	generatesubheader = () => {
		return {
			text: '',
			completelist: [],
			list: [],
			skey: '',
			bsubheading: true,
			chevronicon: 'utility:chevrondown',
			chevronstate: 'down',
			isexpanded: false,
			slinktitle: 'Show more',
			bshowmore: false,
			bchevron: false,
		};
	};

	generatetextcontent = () => {
		return {
			text: '',
			lstcitation: [],
			bcitation: false,
			list: [],
			btext: true,
		};
	};

	generatecard = () => {
		return {
			interaction_id: '',
			customer_type: '',
			enterprise_person_id: '',
			member_id: '',
			customer_id: '',
			card_id: '',
			reply: false,
			reply_card_ids: [],
			reply_card_id: '',
			reply_card_header: '',
			query_id: '',
			timestamp: '',
			card_status: '',
			header: '',
			type: '',
			bloading: false,
			contentlist: [],
			isabandoned: false,
			sicon: '',
			sicontext: '',
			siconclass: '',
			abandoned_reason: `We couldn't complete your request. No relevant information was found at this time.
                            As Agent Assist continues to grow and improve, more complete and helpful responses will
                            become available.`,
			cardfeedback: undefined,
			feedbacktext: '',
			feedbackselected: false,
			likeiconstyle: 'slds-button__icon_x-large like-icon',
			displayfeedback: false,
			feedbackRetryCount: 0,
			showreplyheader: false,
			aria_id: '',
			actions: [
				{
					iconName: 'utility:reply',
					name: 'reply',
					class: 'slds-button__icon_x-large',
					defaultclass: 'slds-button__icon_x-large',
					skey: 'reply',
					selected: false,
					disabled: false,
					title: 'Reply',
				},
				{
					iconName: 'utility:like',
					name: 'thumbsup',
					class: 'slds-button__icon_x-large like-icon',
					defaultclass: 'slds-button__icon_x-large like-icon',
					skey: 'thumbsup',
					selected: false,
					disabled: false,
					title: 'Thumbs Up',
				},
				{
					iconName: 'utility:dislike',
					name: 'thumbsdown',
					class: 'slds-button__icon_x-large',
					defaultclass: 'slds-button__icon_x-large',
					skey: 'thumbsdown',
					selected: false,
					disabled: false,
					title: 'Thumbs Down',
				},
			],
			feedbackoptions: [
				{
					title: 'Not relevant',
					value: 'Not relevant',
					selected: false,
					name: 'NotAccurate',
					skey: 'NotAccurate',
				},
				{
					title: 'Information is not accurate',
					value: 'Information is not accurate',
					selected: false,
					name: 'ContentNotAccurate',
					skey: 'ContentNotAccurate',
				},
				{
					title: 'Content is confusing',
					value: 'Content is confusing',
					selected: false,
					name: 'ContentConfusing',
					skey: 'ContentConfusing',
				},
			],
		};
	};
}

const cardMetaDataProperties = [
	'interaction_id',
	'customer_type',
	'enterprise_person_id',
	'member_id',
	'customer_id',
	'card_id',
	'reply',
	'reply_card_ids',
	'query_id',
	'timestamp',
	'card_status',
];

export const KnowledgeLabels = {
	ErrorMessage: 'Agent Assist is not available, please follow your normal process',
	feedbackmessage: 'Thank you for your feedback',
	KnowledgeDisabledAMaEnabledMessage:
		'Knowledge Retrieval has been disabled while we investigate an error. Please try using Ask me Anything to manually request information.',
	KnowledgeDisabledMessage: 'Knowledge Retrieval has been disabled while we investigate an error.',
	AmaDisableMessage: 'Ask me Anything has been disabled while we investigate an error.',
	I360DisableMessage: 'Interaction 360 has been disabled while we investigate an error.',
};
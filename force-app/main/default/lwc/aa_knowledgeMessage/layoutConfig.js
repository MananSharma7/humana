export class CardModal {
    generatecard = () => {
        return {
            id: '',
            callId: '',
            status: '',
            type: '',
            heading: '',
            contentList: [],
            isAbandanded: false,
            reasonForAbandance: '',
            isThumbUpSelected: false,
            isThumbDownSelected: false,
            sLikeStyle: 'slds-button__icon_x-large like-icon',
            sDislikeStyle: 'slds-button__icon_x-large',
            sResonForThumbsDown: '',
            bFeedbackOptions : false,
            sThumbsDownComment: '',
            relatedCardId: '',
            bisReplyCard: false,
            sRelatedCardTitle: '',
            buttons : [],
            feedbackOptions:[
                {
                    title: 'Not relevant',
                    value : 'Not relevant',
                    bSelected : false,
                    sId : 'NotAccurate'
                },
                 {
                    title: 'Information is not accurate',
                    value : 'Information is not accurate',
                    bSelected : false,
                    sId : 'ContentNotAccurate'
                },
                 {
                    title: 'Content is confusing',
                    value : 'Content is confusing',
                    bSelected : false,
                    sId : 'ContentConfusing'
                },
            ]
        };
    }
}
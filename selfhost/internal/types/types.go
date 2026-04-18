package types

type SyncLocalFilesResponse struct {
	NewConversationIDs     []string `json:"newConversationIds"`
	UpdatedConversationIDs []string `json:"updatedConversationIds"`
}

import { useState } from "react";
import AIGoalsReview from "./AIGoalsReview";
import GoalsChat from "@/components/GoalsChat";
import ViewToggle from "@/components/ViewToggle";

const GoalsPage = () => {
  const [showChat, setShowChat] = useState(false);

  return (
    <>
      {showChat ? <GoalsChat /> : <AIGoalsReview />}
      <ViewToggle isChat={showChat} onToggle={() => setShowChat(!showChat)} />
    </>
  );
};

export default GoalsPage;